const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Define the schema for a User
const userSchema = new mongoose.Schema({
    fullName: { type: String, required: true },       // User's full name
    email: { type: String, required: true, unique: true },  // User's email (unique)
    password: { type: String, required: true },      // User's password (hashed)
});

// Hash the password before saving the user
userSchema.pre('save', async function (next) {
    if (this.isModified('password') || this.isNew) {
        this.password = await bcrypt.hash(this.password, 10);
    }
    next();
});

// Method to compare password with the hashed password in the database
userSchema.methods.comparePassword = async function (candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

// Export the model
module.exports = mongoose.model('User', userSchema);
