This is an experiment connecting to MongoDB server from web browser and using
[Change Streams](https://docs.mongodb.com/manual/changeStreams/) for reactive updates.

The idea is that by allowing web clients to directly connect to a MongoDB database server we remove all the overhead
and latency introduced by intermediary code: multiple serializations and deserializations, memory buffers, etc. Because
web browsers cannot directly connect to a TCP port, the web app exposes a thin WebSockets-TCP proxy which does not
process packets but just passes them back and forth.

Change Streams is an official MongoDB API since MongoDB 3.6 to hook into the 

Considerations:

* You will probably want to enable authentication on the MongoDB server and expose only some collections as
  read-only for an user the web app would be connecting as. You would provide this user's username and password
  as part of your web app code.
* Modifications to database should come through regular RPC calls through the web app instead of directly
  modifying the database from the web app.
* This requires MongoDB to be publicly available on the Internet. Even with enabled authentication it is unclear
  how secure this is. This is not how MongoDB is generally deployed and it might be that there are some unknown
  security issues with such deployment.
* There is a suggested (not sure if hard) limit of 1000 Change Streams queries per MongoDB data node. So not
  sure how scalable this is, but you could try to increase number of replicas and introduce sharding.
* If you do not want to send change stream for the whole collection to the client and you use `$match` to limit
  changes being streamed, note that there will be no change notification when a document stops matching a query.
  Because of this the best is to query only on fields you never change.
* This simple web app's bundle is already 1.2 MB minimized.

## How to run ##

You should have a MongoDB instance with replica set configured. You can do this by running MongoDB in a Docker container:

```
$ docker run -d --rm -p 27017:27017 --name mongo mongo:3.6.3 --replSet app
$ echo 'rs.initiate({_id: "app", members: [{_id: 0, host: "127.0.0.1:27017"}]})' | docker exec -i mongo mongo
```

After that you can run this web app:

```
$ npm run build
$ npm run start
```

Open [http://localhost:5000/](http://localhost:5000/).

You can click "Add event" button to add a random message to the event log, which is then reactively shown to you.

