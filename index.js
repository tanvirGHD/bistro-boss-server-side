const express = require('express');
const app = express();
const jwt = require('jsonwebtoken');
const cors = require('cors');
require('dotenv').config()
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const port = process.env.PORT || 5000;


//Middleware
app.use(cors());
app.use(express.json())



const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.y15rh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();



    const userCollection = client.db("bistroDb").collection("users")
    const menuCollection = client.db("bistroDb").collection("menu")
    const reviewsCollection = client.db("bistroDb").collection("reviews")
    const cartCollection = client.db("bistroDb").collection("carts")
    const paymentCollection = client.db("bistroDb").collection("payments")


    //jwt related apis
    app.post('/jwt', async(req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {expiresIn:'1h'})
      res.send({token})
    })

    //middlewares (verify token)
    const verifyToken = (req, res, next) =>{
      // console.log('inside verify token',req.headers.authorization);
      if(!req.headers.authorization){
        return res.status(401).send({message: 'unauthorize access'})
      }
      const token = req.headers.authorization.split(' ')[1]
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) =>{
        if(err){
          return res.status(401).send({message: 'unauthorize access'});
        }
        req.decoded = decoded;
        next();
      })
    }

    //middleware verifyAdmin ==>> use verify admin after verifyToken 
    const verifyAdmin = async(req, res, next) => {
      const email = req.decoded.email;
      const query = {email: email};
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === 'admin';
      if(!isAdmin){
        return res.status(403).send({message: 'forbidden access'})
      }
      next();
    }


    //users related api///user collection cerate
    app.post('/users', async(req, res)=>{
      const user = req.body;
      //insert email if user doesn't exists
      //you can do this many ways (1.email unique, 2.upsert, 3.simple checking) 
      const query = {email: user.email}
      const existingUser = await userCollection.findOne(query);
      if(existingUser){
        return res.send({message: 'User Already exists', insertedId: null})
      }
      const result = await userCollection.insertOne(user);
      res.send(result)
    })


    //admin related api
    app.patch('/users/admin/:id',verifyToken, verifyAdmin, async(req, res) => {
      const id = req.params.id;
      const filter = {_id: new ObjectId(id)};
      const updatedDoc = {
        $set: {
          role: 'admin'
        }
      }
      const result = await userCollection.updateOne(filter, updatedDoc);
      res.send(result);
    })


    //user data load
    app.get('/users',verifyToken, verifyAdmin, async(req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result)
    })


    //admin check kora
    app.get('/user/admin/:email', verifyToken, async(req, res) =>{
      const email = req.params.email;
      if(email !== req.decoded.email){
        return res.status(403).send({message: 'forbidden access'})
      }
      const query = {email: email};
      const user = await userCollection.findOne(query);
      let admin = false;
      if(user){
        admin = user?.role === 'admin'
      }
      res.send({ admin });
    })
    


    //user delete 
    app.delete('/users/:id',verifyToken, verifyAdmin, async(req,res) => {
      const id = req.params.id;
      const query = {_id: new ObjectId(id)}
      const result = await userCollection.deleteOne(query)
      res.send(result);
    })


    //data pete caile // akan All menu golar ta anci
    app.get('/menu', async(req,res)=>{
        const result = await menuCollection.find().toArray();
        res.send(result)
    });

    // add items
    app.post('/menu', verifyToken,verifyAdmin, async(req, res) => {
      const item = req.body;
      const result = await menuCollection.insertOne(item);
      res.send(result);
    })


    //delete menu items
    app.delete('/menu/:id', verifyToken, verifyAdmin, async(req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await menuCollection.deleteOne(query);
      res.send(result);
    })


    //update menu item
    app.get('/menu/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await menuCollection.findOne(query);
      res.send(result);
    })


    //cart er data gola ance
    app.get('/carts', async(req, res) => {
      const email = req.query.email;
      const query = {email: email}
      const result = await cartCollection.find(query).toArray();
      res.send(result)
    })


    //cart collection create 
    app.post('/carts', async(req, res) => {
      const cartItem = req.body;
      const result = await cartCollection.insertOne(cartItem);
      res.send(result);
    })


    // cart delete
    app.delete('/carts/:id', async(req, res) => {
      const id = req.params.id;
      const query = {_id: new ObjectId(id)}
      const result = await cartCollection.deleteOne(query)
      res.send(result)
    })

    //data pete caile // akan a review er gola 
    app.get('/reviews', async(req,res)=>{
        const result = await reviewsCollection.find().toArray();
        res.send(result)
    })
    


    //payment intent
    app.post('/create-payment-intent', async(req, res) =>{
      const {price} = req.body;
      const amount = parseInt(price * 100);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card']
      })
      res.send({
        clientSecret: paymentIntent.client_secret
      })
    })

    //Payment History
    app.get('/payments', verifyToken, async(req, res) => {
      const query = {email: req.params.email}
      if(req.params.email !== req.decoded.email){
        return res.status(403).send({message: 'forbidden access'})
      }
      const result = await paymentCollection.find(query).toArray();
      res.send(result);
    })



    //payment related API
    app.post('/payment', async(req, res) =>{
      const payment = req.body;
      const paymentResult = await paymentCollection.insertOne(payment);

      //carefully delete each item from the cart
      console.log('payment info', payment)
      const query = {_id: {
        $in: payment.cartIds.map(id => new ObjectId(id))
      }}
      const deleteResult = await cartCollection.deleteMany(query)
      res.send({paymentResult, deleteResult})
    });

    



    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);



app.get('/', (req, res) => {
    res.send('boss is sitting')
})

app.listen(port,()=>{
    console.log(`Bistro boss is sitting on port ${port}`);
})