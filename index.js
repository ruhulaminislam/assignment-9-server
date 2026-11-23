//server setup
import express from 'express';
import cors from 'cors';
import { MongoClient, ObjectId } from 'mongodb';
import 'dotenv/config'
import Stripe from "stripe";
import { jwtVerify, createRemoteJWKSet } from "jose";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const app = express();
const port = 5000;

app.use(cors());
//middleware
// Stripe Webhook Route এখানে থাকবে

// অবশ্যই express.json() middleware-এর আগে রাখতে হবে

app.post(
  "/webhook/stripe",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    let event;

    // 1. Verify Stripe Signature
    const signature = req.headers["stripe-signature"];

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (error) {
      console.error("Webhook signature verification failed:", error.message);
      return res.status(400).send("Invalid signature");
    }

    try {
      // 2. Handle completed Checkout Session
      if (event.type !== "checkout.session.completed") {
        return res.status(200).send("Event ignored");
      }

      const session = event.data.object;

      const {
        id: session_id,
        status,
        customer_email,
        metadata,
        payment_intent,
        payment_status,
        currency,
        amount_total,
      } = session;

      // 3. Verify Payment
      if (status !== "complete" || payment_status !== "paid") {
        return res.status(200).send("Payment not completed");
      }

      // 4. Get Appointment ID
      const appointmentId = metadata?.appointmentId;

      if (!appointmentId || !ObjectId.isValid(appointmentId)) {
        console.error("Invalid appointment ID:", appointmentId);
        return res.status(400).send("Invalid appointment ID");
      }

      // 5. Check Existing Transaction
      const existingTransaction =
        await transactionsCollection.findOne({
          stripeSessionId: session_id,
        });

      if (existingTransaction) {
        await appointmentsCollection.updateOne(
          { _id: new ObjectId(appointmentId) },
          { $set: { paymentStatus: "paid" } }
        );

        return res.status(200).send("Transaction already exists");
      }

      // 6. Create Transaction
      const transaction = {
        stripeSessionId: session_id,
        appointmentId,
        customerId: metadata?.userId,
        status: "paid",
        amount: amount_total,
        currency,
        createdAt: new Date(),

        // Optional additional information
        customer_email,
        payment_intent,
      };

      await transactionsCollection.insertOne(transaction);

      // 7. Update Appointment Payment Status
      await appointmentsCollection.updateOne(
        { _id: new ObjectId(appointmentId) },
        {
          $set: {
            paymentStatus: "paid",
          },
        }
      );

      console.log("Stripe webhook: Payment processed successfully");

      return res.status(200).send({
        received: true,
        message: "Payment processed successfully",
      });

    } catch (error) {
      console.error("Stripe webhook processing error:", error);

      return res.status(500).send("Webhook processing failed");
    }
  }
);
app.use(express.json());


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
const sessionsCollection = db.collection("session");
const appointmentsCollection = db.collection("appointments");
const transactionsCollection = db.collection("transactions");

//middleware to parse incoming JSON requests
const verifyToken= async(req,res,next)=>{
  const authHeader=req.headers.authorization
  if(!authHeader){
     return res.status(401).send({mes:"not autheratization"})
  }
  const token=authHeader.split(" ")[1]
  console.log(token)
  if(!token){
    return res.status(401).send({mes:"not autheratization"})
  }
  const JWKS=createRemoteJWKSet(new URL(`${process.env.BETTER_AUTH_URL}/api/auth/jwks`))
  try {
   const { payload } = await jwtVerify(token, JWKS);

const user = await usersCollection.findOne({
  _id: new ObjectId(payload.sub),
});
console.log(user)
if (!user) {
  return res.status(401).send({
    message: "User not found",
  });
}

req.user = user;
next();
     
  } catch (error) {
    return res.status(401).send({mes:"not authorization"})
  }
 
}
//token verify 
// const verifyToken = async (req, res, next) => {
//     const authHeader = req.headers.authorization;
//     if (!authHeader) {
//         return res.status(401).send({ message: 'Unauthorized' });
      
//     }
//     const token = authHeader.split(' ')[1];
//     if (!token) {
//         return res.status(401).send({ message: 'Unauthorized' });
//     }
//     const query={token}
//     const session=await sessionsCollection.findOne(query,)
//     if(!session){
//         return res.status(401).send({ message: 'Unauthorized' });
//     }
//     const userId=session.userId;
//     const userQuery={_id: new ObjectId(userId)}
//      const user=await usersCollection.findOne(userQuery)
//      if(!user){
//         return res.status(401).send({ message: 'Unauthorized' });
//      }
//     req.user=user;
//     next();
// }
const veryfiyUser=(req,res,next)=>{
   
    if(req.user.role!=='user'){
        return res.status(401).send({ message: 'Unauthorized' });
    }
    next();
}
const verifyAdmin=(req,res,next)=>{
    if(req.user.role!=='admin'){
        return res.status(401).send({ message: 'Unauthorized' });
    }
    next();
}
//middleware to parse incoming JSON requests




app.get('/',(req, res) => {
  res.send('Hello World!');
});





//user api
app.get('/users',verifyToken,verifyAdmin, async (req, res) => {
  const users = await usersCollection.find().toArray();
  res.send(users);
});
//user block and unblock admin
app.patch("/users/block/:id", verifyToken,verifyAdmin,  async (req, res) => {
  const id = req.params.id;

  if (!ObjectId.isValid(id)) {
    return res.status(400).send({ message: "Invalid user ID" });
  }

  const query = { _id: new ObjectId(id) };

 

  const result = await usersCollection.updateOne(query, {
    $set: req.body,
  });

  res.send(result);
});
//update admin profile
app.patch('/users/update-admin/:id',verifyToken,verifyAdmin, async (req, res) => {
   const isValid = req.params.id;
  if (!ObjectId.isValid(isValid)) {
    return res.status(400).send({ message: "Invalid user ID" });
  }
   const id = { _id: new ObjectId(req.params.id) };
   const data={
    ...req.body
   }
   const result = await usersCollection.updateOne(id, { $set: data });
   res.send(result);
});
//update user profile
app.patch('/users/update-user/:id',verifyToken,veryfiyUser, async (req, res) => {
  if(req.user.isBlocked){
    return res.status(403).send({ message: "Forbidden access" });
  }
   const isValid = req.params.id;
  if (!ObjectId.isValid(isValid)) {
    return res.status(400).send({ message: "Invalid user ID" });
  }
   const id = { _id: new ObjectId(req.params.id) };
   const data={
    ...req.body
   }
   const result = await usersCollection.updateOne(id, { $set: data });
   res.send(result);
});



//service add
app.post("/services", verifyToken,verifyAdmin,async (req, res) => {
   const service = req.body;
   if (!service.image) {
     return res.status(400).send({ error: "Service image is required" });
   }
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
  //filter service by status
  
  // ৩. Database থেকে data আনা
  const services = await servicesCollection
    .find({...filter,status:"active"})
    .sort(sortOption)
    .toArray();

  res.send(services);
});
//private services api
app.get("/services",verifyToken,verifyAdmin, async (req, res) => {
  const services = await servicesCollection.find().toArray();
  res.send(services);
});
//services get by id
app.get("/services/:id",verifyToken, async (req, res) => {
  console.log(req.user);
  if(req.user.isBlocked){
    return res.status(403).send({ message: "Forbidden access" });
  }
  const id = req.params.id;
  const objectId = new ObjectId(id);
  const service = await servicesCollection.findOne({ _id: objectId ,status:"active" });
  res.send(service);
});
//services delete
app.delete("/services/delete/:id",verifyToken,verifyAdmin, async (req, res) => {
  const id = req.params.id;
  const objectId = new ObjectId(id);
  const service = await servicesCollection.deleteOne({ _id: objectId });
  res.send(service);
});
//services status update
app.patch("/services/status/:id",verifyToken,verifyAdmin, async (req, res) => {
  const id = req.params.id;
  const objectId = new ObjectId(id);
  const service = await servicesCollection.updateOne({ _id: objectId }, { $set: { status: req.body.status } });
  res.send(service);
});
//services update
app.patch("/services/update/:id",verifyToken,verifyAdmin, async (req, res) => {
  const id = req.params.id;
  const objectId = new ObjectId(id);
  const service = await servicesCollection.updateOne({ _id: objectId }, { $set: req.body });
  res.send(service);
});
 //api





//appointment api for customer
app.post("/appointments",verifyToken,veryfiyUser, async (req, res) => {
  if(req.user.isBlocked){
    return res.status(403).send({ message: "Forbidden access" });
  }
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
//appointment get all for admin
app.get("/appointments",verifyToken,verifyAdmin, async (req, res) => {
 
  const appointments = await appointmentsCollection.find().toArray();
  res.send(appointments);
});
//appointment update status   by admin
app.patch("/appointments/status/:id",verifyToken,verifyAdmin, async (req, res) => {
  const id = req.params.id;
  const objectId = new ObjectId(id);
  const appointment = await appointmentsCollection.updateOne({ _id: objectId }, { $set: { status: req.body.status } });
  res.send(appointment);
});


//get all appointment by customer id
app.get("/appointments/customer/:id", verifyToken,veryfiyUser, async (req, res) => {
  if(req.user.isBlocked){
    return res.status(403).send({ message: "Forbidden access" });
  }
  try {
    const { id } = req.params;

   const appointments = await appointmentsCollection
  .find({
    customerId: req.user._id.toString(),
  })
  .toArray();

    res.send(appointments);
  } catch (error) {
    console.error(error);

    res.status(500).send({
      success: false,
      message: "Server error",
    });
  }
});


//appointment cancel by user
app.patch(
  "/appointments/cancel/:id",
  verifyToken,
  veryfiyUser,
  async (req, res) => {
    try {
      const { id } = req.params;

      if (!ObjectId.isValid(id)) {
        return res.status(400).send({
          success: false,
          message: "Invalid appointment id",
        });
      }

      const result = await appointmentsCollection.updateOne(
        {
          _id: new ObjectId(id),
          customerId: req.user._id.toString(),
          status: "pending",
        },
        {
          $set: { status: "cancelled" },
        }
      );

      if (result.matchedCount === 0) {
        return res.status(404).send({
          success: false,
          message: "Appointment not found, not yours, or no longer pending",
        });
      }

      return res.status(200).send({
        success: true,
        message: "Appointment cancelled",
      });
    } catch (error) {
      console.error("Cancel appointment error:", error);

      return res.status(500).send({
        success: false,
        message: "Server error",
      });
    }
  }
);

//transaction api
app.post(
  "/transactions",
  verifyToken,
  veryfiyUser,
  async (req, res) => {
    try {
      const { session_id } = req.body;

      if (!session_id) {
        return res.status(400).send({
          success: false,
          message: "Session ID is required",
        });
      }

      // 1. Retrieve Checkout Session from Stripe
      const session = await stripe.checkout.sessions.retrieve(session_id);

      // 2. Verify Payment
      if (
        session.status !== "complete" ||
        session.payment_status !== "paid"
      ) {
        return res.status(400).send({
          success: false,
          message: "Payment is not completed",
        });
      }

      // 3. Get Transaction Created by Webhook
      const transaction = await transactionsCollection.findOne({
        stripeSessionId: session.id,
      });

      // Webhook may not have processed the event yet
      if (!transaction) {
        return res.status(202).send({
          success: false,
          processing: true,
          message: "Payment is being processed. Please try again.",
        });
      }

      // 4. Send Transaction Information to Success Page
      return res.send({
        success: true,
        message: "Payment successful",
        transaction,
      });

    } catch (error) {
      console.error("Transaction error:", error);

      return res.status(500).send({
        success: false,
        message: "Transaction information could not be retrieved",
      });
    }
  }
);
//get all transactions
app.get("/transactions",verifyToken, verifyAdmin,  async (req, res) => {
  // try {
  //   const transactions = await transactionsCollection.find().toArray();
  //   console.log(transactions);
  //   res.send({
  //     success: true,
  //     message: "Transactions retrieved successfully",
  //     transactions,
  //   });
  // } catch (error) {
  //   console.error("Error retrieving transactions:", error);
  //   res.status(500).send({
  //     success: false,
  //     message: "Failed to retrieve transactions",
  //   });
  // }
  const transactions = await transactionsCollection.find().toArray();
  res.send(transactions);
});


app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
export default app;