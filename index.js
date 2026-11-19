//server setup
import express from 'express';
import cors from 'cors';
import { MongoClient, ObjectId } from 'mongodb';
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
//user block and unblock
app.patch('/users/block/:id', async (req, res) => {
   
   const id = { _id: new ObjectId(req.params.id) };
   const data={
    ...req.body
   }
   const result = await usersCollection.updateOne(id, { $set: data });
   res.send(result);
});
//update admin profile
app.patch('/users/update-admin/:id', async (req, res) => {
   
   const id = { _id: new ObjectId(req.params.id) };
   const data={
    ...req.body
   }
   const result = await usersCollection.updateOne(id, { $set: data });
   res.send(result);
});




//service add
app.post("/services", async (req, res) => {
   const service = req.body;
   const result = await servicesCollection.insertOne(service);
   res.send(result);
});
//services api
app.get("/services/public", async (req, res) => {
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
//private services api
app.get("/services", async (req, res) => {
  const services = await servicesCollection.find().toArray();
  res.send(services);
});
//services get by id
app.get("/services/:id", async (req, res) => {
  const id = req.params.id;
  const objectId = new ObjectId(id);
  const service = await servicesCollection.findOne({ _id: objectId });
  res.send(service);
});
//services delete
app.delete("/services/delete/:id", async (req, res) => {
  const id = req.params.id;
  const objectId = new ObjectId(id);
  const service = await servicesCollection.deleteOne({ _id: objectId });
  res.send(service);
});
//services status update
app.patch("/services/status/:id", async (req, res) => {
  const id = req.params.id;
  const objectId = new ObjectId(id);
  const service = await servicesCollection.updateOne({ _id: objectId }, { $set: { status: req.body.status } });
  res.send(service);
});
//services update
app.patch("/services/update/:id", async (req, res) => {
  const id = req.params.id;
  const objectId = new ObjectId(id);
  const service = await servicesCollection.updateOne({ _id: objectId }, { $set: req.body });
  res.send(service);
});
 //api
app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
