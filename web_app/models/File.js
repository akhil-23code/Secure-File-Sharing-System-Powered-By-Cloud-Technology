const mongoose = require('mongoose');

// Define the schema for a File
const fileSchema = new mongoose.Schema({
    filename: { type: String, required: true },          // Name of the uploaded file
    uploadedBy: { type: String, required: true },        // Email of the user who uploaded the file
    sharedWith: [{ type: String }],                       // List of users who have access to the file
    dateUploaded: { type: Date, default: Date.now },      // Timestamp of when the file was uploaded
});

// Export the model
module.exports = mongoose.model('File', fileSchema);
