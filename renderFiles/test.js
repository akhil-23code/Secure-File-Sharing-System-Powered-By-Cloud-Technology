const mongodb = require("mongodb");
const mongoClient = mongodb.MongoClient;

const uri = process.env.MONGO_URI;

mongoClient.connect(uri, { useUnifiedTopology: true })
    .then((client) => {
        console.log("Connected to database");
        const db = client.db("file_transfer");
        console.log("Database:", db.databaseName);
        client.close();
    })
    .catch((err) => {
        console.error("Database connection error:", err.message);
    });
