//server setup
import express from 'express';
import cors from 'cors';
import { MongoClient, ObjectId } from 'mongodb';
import 'dotenv/config'
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
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
//update user profile
app.patch('/users/update-user/:id', async (req, res) => {
   
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




//appointment api
app.post("/appointments", async (req, res) => {
  const {appointmentDate,timeSlot} =req.body;
  const custmerId = req.body.customerId;
  const id={_id: new ObjectId(custmerId)};
  const customer = await usersCollection.findOne(id);
    if(customer.role==="admin"){
      return res.status(400).send({ message: "Admin cannot book appointment" });
    }
  const existingAppointment = await appointmentsCollection.findOne({ appointmentDate, timeSlot,status:{$in:["pending","confirmed"]} });
  if (existingAppointment) {
    return res.status(400).send({ message: "Appointment already exists" });
  }
  const appointment = req.body;
  const data = {
    ...appointment,
    createdAt: new Date(),
    status: "pending",
    paymentStatus: "unpaid"
  };
  const result = await appointmentsCollection.insertOne(data);
  res.send(result);
});
//appointment get all
app.get("/appointments", async (req, res) => {
  const appointments = await appointmentsCollection.find().toArray();
  res.send(appointments);
});
//appointment update status
app.patch("/appointments/status/:id", async (req, res) => {
  const id = req.params.id;
  const objectId = new ObjectId(id);
  const appointment = await appointmentsCollection.updateOne({ _id: objectId }, { $set: { status: req.body.status } });
  res.send(appointment);
});
//appointment cancel

//get all appointment by customer id
app.get("/appointments/customer/:id", async (req, res) => {
  const id = req.params.id;
 
  const appointments = await appointmentsCollection.find({ customerId: id }).toArray();
  res.send(appointments);
});
//appointment cancel by user
app.patch("/appointments/cancel/:id", async (req, res) => {
  const id = req.params.id;
  const objectId = new ObjectId(id);
  const appointment = await appointmentsCollection.updateOne({ _id: objectId }, { $set: { status: "cancelled" } });
  res.send(appointment);
}); 

//transaction api
app.post("/transactions", async (req, res) => {
  try {
    const { session_id } = req.body;

    if (!session_id) {
      return res.status(400).send({
        success: false,
        message: "Session ID is required",
      });
    }

    // Retrieve checkout session from Stripe
    const session = await stripe.checkout.sessions.retrieve(session_id);

    const {
      id,
      status,
      customer_email,
      metadata,
      payment_intent,
      payment_status,
      currency,
      amount_total,
    } = session;

    // Verify payment
    if (status !== "complete" || payment_status !== "paid") {
      return res.status(400).send({
        success: false,
        message: "Payment is not completed",
      });
    }

    // Get appointment ID from Stripe metadata
    const appointmentId = metadata?.appointmentId;

    if (!appointmentId) {
      return res.status(400).send({
        success: false,
        message: "Appointment ID not found",
      });
    }

    // Check if transaction already exists
    const existingTransaction = await transactionsCollection.findOne({
      session_id,
    });

    if (existingTransaction) {
      return res.send({
        success: true,
        message: "Transaction already exists",
        transaction: existingTransaction,
      });
    }

    // Create transaction document
    const transaction = {
      session_id: id,
      appointmentId,
      status,
      customer_email,
      userId: metadata?.userId,
      payment_intent,
      payment_status,
      amount: amount_total,
      currency,
      paymentDate: new Date(),
    };

    // Save transaction
    const result = await transactionsCollection.insertOne(transaction);

    // Update appointment payment status
    const appointmentResult = await appointmentsCollection.updateOne(
      {
        _id: new ObjectId(appointmentId),
      },
      {
        $set: {
          paymentStatus: "paid",
        },
      }
    );

    return res.send({
      success: true,
      message: "Payment successful",
      transactionId: result.insertedId,
      appointmentUpdated: appointmentResult.modifiedCount > 0,
    });

  } catch (error) {
    console.error("Transaction error:", error);

    return res.status(500).send({
      success: false,
      message: "Transaction failed",
    });
  }
});



app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
