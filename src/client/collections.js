import {MongoClient} from 'mongodb';

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
  }

  static _processChange(change) {
    console.log('change', change);
  }

  static addEvent() {
    console.log("add event");
  }
}

Event.collectionName = 'Events';
Event.documents = [];
Event._idToIndex = new Map();

Event.sync().catch(function (error) {
  console.log(`Error syncing the '${Event.collectionName}' collection`, error);
});
