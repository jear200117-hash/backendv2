const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

async function createHost() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Check if host already exists
    const existingHost = await User.findOne({ 
      email: process.env.HOST_EMAIL 
    });

    if (existingHost) {
      console.log('Host user already exists!');
      process.exit(0);
    }

    // Create host user
    const host = new User({
      email: process.env.HOST_EMAIL,
      password: process.env.HOST_PASSWORD,
      role: 'host'
    });

    await host.save();
    console.log('Host user created successfully!');
    console.log(`Email: ${host.email}`);
    console.log('Password: [hidden for security]');

  } catch (error) {
    console.error('Error creating host:', error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

createHost();
