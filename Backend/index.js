const express = require("express");
require("dotenv").config();
const mongoose = require("mongoose");
const cors = require("cors");
const app = express();

const PORT = process.env.PORT || 3000;
const authRoutes = require("./Routes/auth");

// app.use(cors());
app.use(express.json());
app.use(express.urlencoded({extended:true}));

app.use("/api/auth", authRoutes);
// connection with MongoDB..
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected successfully'))
  .catch(err => console.error('MongoDB connection error:', err));

// app.use('/auth', authRoutes);

app.get('/', (req , res)=>{
    res.send("Hiiiiii...")
});


app.listen(PORT, (err)=>{
    if (err) {
        console.log(err) ;       
    } else {
        console.log(`Server started at http://localhost:${PORT}`);
    }
});