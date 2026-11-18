//server setup
import express from 'express';
import cors from 'cors';
import { MongoClient } from 'mongodb';
import 'dotenv/config'
const app = express();
const port = 5000;


//middleware
app.use(express.json());
app.use(cors());

//mongodb conection

const client = new MongoClient(process.env.MONGODB_URI);
export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
  }
}
const connectedClient = await connectToMongoDB();
const db = connectedClient.db("assignment-nine");
const servicesCollection = db.collection("services");
const usersCollection = db.collection("user");
const appointmentsCollection = db.collection("appointments");
const transactionsCollection = db.collection("transactions");

//user api
app.get('/users', async (req, res) => {
  const users = await usersCollection.find().toArray();
  res.send(users);
});

//services api
app.get("/services", async (req, res) => {
  const { search, category, sort } = req.query;

  // ১. Filter
  const filter = {};

  if (search) {
     const cleaned = search.trim().replace(/\s+/g, "");
  
  filter.serviceName = {
    $regex: cleaned.split("").join("\\s*"),
    $options: "i",
  };
    
  }

  if (category) {
    filter.category = category;
  }

  // ২. Sort
  let sortOption = {};

  if (sort === "price-asc") sortOption = { price: 1 };
  if (sort === "price-desc") sortOption = { price: -1 };

  // ৩. Database থেকে data আনা
  const services = await servicesCollection
    .find(filter)
    .sort(sortOption)
    .toArray();

  res.send(services);
});
 //api
app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
