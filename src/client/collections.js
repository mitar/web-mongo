import assert from 'assert';
import {MongoClient} from 'mongodb';
import Vue from 'vue';

// This URL is hard-coded to be recognized by the "net" module shim as mongo connection.
const url = 'mongodb://localhost:27017';
// TODO: Make configurable.
const dbName = 'app';

const mongoClientPromise = MongoClient.connect(url, {promiseLibrary: Promise});

mongoClientPromise.then(function (client) {
  console.log("Connected to Mongo.");
}, function (error) {
  console.log("Error connecting to Mongo", error);
});

function removeField(doc, path) {
  assert(path.length > 0);

  // This works both for objects and arrays, even if "path[0]" is a stringified number.
  if (!doc.hasOwnProperty(path[0])) {
    // It seems this has already been removed.
    return;
  }

  if (path.length === 1) {
    Vue.delete(doc, path[0]);
    return;
  }

  removeField(doc[path[0]], path.slice(1));
}

function removeFields(doc, removedFields) {
  for (const field of removedFields) {
    removeField(doc, field.split('.'));
  }
}

function updateField(doc, path, value) {
  assert(path.length > 0);

  if (path.length === 1) {
    Vue.set(doc, path[0], value);
    return;
  }

  if (!doc.hasOwnProperty(path[0])) {
    Vue.set(doc, path[0], {});
  }

  updateField(doc[path[0]], path.slice(1), value);
}

function updateFields(doc, updatedFields) {
  for (const key in updatedFields) {
    if (updatedFields.hasOwnProperty(key)) {
      updateField(doc, key.split('.'), updatedFields[key]);
    }
  }
}

export class Event {
  constructor(obj) {
    Object.assign(this, obj);
  }

  static async sync() {
    let initializing = true;
    const pendingChanges = [];

    const client = await mongoClientPromise;
    const db = client.db(dbName);

    // To make sure collection exists before we start watching it.
    await db.createCollection(this.collectionName);

    const collection = db.collection(this.collectionName);
    const changeStream = collection.watch([
      {
        // TODO: We do not use it.
        $project: {
          ns: 0,
        },
      },
    ]);

    changeStream.on('change', (change) => {
      if (initializing) {
        pendingChanges.push(change);
      }
      else {
        this._processChange(change);
      }
    });

    changeStream.on('error', (error) => {
      console.log(`Error syncing the '${this.collectionName}' collection`, error);
    });

    let index = 0;
    await collection.find({}, {
      // Assumption is that "createdAt" never changes.
      sort: [['createdAt', 'desc']],
      // TODO: Make configurable.
      limit: 100,
    }).forEach((document) => {
      this.documents.push(document);
      this._idToIndex.set(document._id.toString(), index);
      index++;
    });

    pendingChanges.forEach((change, i) => {
      this._processChange(change);
    });
    pendingChanges.length = 0;
    initializing = false;

    return {
      async stop() {
        await changeStream.close();
      },
    }
  }

  static _processChange(change) {
    if (change.operationType === 'insert') {
      const id = change.documentKey._id.toString();
      // Maybe we already have this document. If we do we assume that the version we
      // have is at least as new as this change, so we can skip the update.
      if (this._idToIndex.has(id)) return;

      let i = 0;
      for (; i < this.documents.length; i++) {
        // Strict inequality because it seems this results in the same
        // order as when Mongo sorts documents on its own.
        if (change.fullDocument.createdAt.valueOf() > this.documents[i].createdAt.valueOf()) {
          break;
        }
      }

      this.documents.splice(i, 0, new this(change.fullDocument));
      this._idToIndex.set(id, i);
    }
    else if (change.operationType === 'delete') {
      const id = change.documentKey._id.toString();
      const index = this._idToIndex.get(id);
      // Maybe we already deleted this document.
      if (index === undefined) return;

      this.documents.splice(index, 1);
      this._idToIndex.delete(id);
    }
    else if (change.operationType === 'replace') {
      const id = change.documentKey._id.toString();
      const index = this._idToIndex.get(id);
      if (index === undefined) {
        // We do not have this document. Make this change an insert and retry.
        change.operationType = 'insert';
        this._processChange(change);
        return;
      }

      // Assumption is that "createdAt" never changes.
      assert.equal(
        this.documents[index].createdAt, change.fullDocument.createdAt,
        `Document '${id}' in '${this.collectionName}' collection had 'createdAt' field changed from '${this.documents[index].createdAt}' to '${change.fullDocument.createdAt}'.`,
      );

      // Because "createdAt" has not changed, the order has not changed,
      // so we can replace the document at the same position.
      this.documents.splice(index, 1, new this(change.fullDocument));
    }
    else if (change.operationType === 'update') {
      const id = change.documentKey._id.toString();
      const index = this._idToIndex.get(id);
      // If we do not have this document, we cannot update it.
      if (index === undefined) return;

      // Assumption is that "createdAt" never changes.
      assert(
        !change.updateDescription.updatedFields.hasOwnProperty('createdAt') || this.documents[index].createdAt === change.updateDescription.updatedFields.createdAt,
        `Document '${id}' in '${this.collectionName}' collection had 'createdAt' field changed from '${this.documents[index].createdAt}' to '${change.updateDescription.updatedFields.createdAt}'.`,
      );
      assert(
        change.updateDescription.removedFields.indexOf('createdAt') === -1,
        `Document '${id}' in '${this.collectionName}' collection had 'createdAt' field removed.`,
      );

      removeFields(this.documents[index], change.updateDescription.removedFields);
      updateFields(this.documents[index], change.updateDescription.updatedFields);
    }
    else if (change.operationType === 'invalidate') {
      console.log(`Syncing '${this.collectionName}' collection got invalidated.`);
    }
  }

  static addEvent() {
    console.log("add event");
  }
}

Event.collectionName = 'Events';
Event.documents = [];
Event._idToIndex = new Map();

const syncHandlePromise = Event.sync();
syncHandlePromise.catch(function (error) {
  console.log(`Error syncing the '${Event.collectionName}' collection`, error);
});

if (module.hot) {
  module.hot.dispose(async (data) => {
    const syncHandle = await syncHandlePromise;
    await syncHandle.stop();

    const client = await mongoClientPromise;
    await client.close();
  });
}
