const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const path = require("path");
const User = require('./models/User');
const File = require('./models/File');

const app = express();
const PORT = 3000;

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json()); // for parsing application/json
app.use(cookieParser());
app.use(express.static('public'))
app.use(express.static(path.join(__dirname, "public")));
app.use(express.static(path.join(__dirname, "views")));

// MongoDB Connection
mongoose.connect('mongodb://localhost:27017/securefiles')
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.log("MongoDB connection error:", err));

// JWT Secret
const JWT_SECRET = "securefilesharingsecretkey";


// Multer Setup for file uploads
const storage = multer.diskStorage({
  destination: path.join(__dirname, "public/uploads"),
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});
const upload = multer({ storage });

// Utility: Authenticate Middleware
const authenticate = (req, res, next) => {
  const token = req.cookies.token;
  if (!token) return res.redirect("/login.html");

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.clearCookie("token");
    res.redirect("/login.html");
  }
};

// Routes

// Serve HTML pages
app.get("/", (req, res) => res.redirect("/login.html"));
app.get("/dashboard", authenticate, (req, res) => res.sendFile(path.join(__dirname, "views/dashboard.html")));
app.get("/file-upload", authenticate, (req, res) => res.sendFile(path.join(__dirname, "views/file-upload.html")));
app.get("/shared-files", authenticate, (req, res) => res.sendFile(path.join(__dirname, "views/shared-files.html")));

// 1. Signup Route
// 2. Signup Route
app.post("/signup", async (req, res) => {
  const { fullName, email, password } = req.body;

  // Check if the user already exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
      return res.status(400).send("User already exists.");
  }

  // Create new user with hashed password
  const newUser = new User({
      fullName,
      email,
      password,  // password will be hashed in the model's pre-save hook
  });

  // Save the user in the database
  await newUser.save();

  // Redirect to login page after successful signup
  res.status(201).redirect("/login.html");
});


// 2. Login Route
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  // Find user by email
  const user = await User.findOne({ email });

  if (!user) {
      return res.status(401).send("User not found.");
  }

  // Compare password with hashed password in the database
  const isPasswordCorrect = await user.comparePassword(password);

  if (!isPasswordCorrect) {
      return res.status(401).send("Invalid credentials.");
  }

  // Create a JWT token for the logged-in user
  const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: "1h" });

  // Set token in the response cookies
  res.cookie("token", token, { httpOnly: true });

  // Redirect to dashboard after successful login
  res.redirect("/dashboard");
});


// 3. Logout Route
app.get("/logout", (req, res) => {
  res.clearCookie("token");
  res.redirect("/login.html");
});

// 4. File Upload Route
app.post("/upload", authenticate, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).send("No file uploaded.");

  const newFile = new File({
    filename: req.file.filename,
    uploadedBy: req.user.email,
    sharedWith: [],
  });

  // Save file data to the database
  await newFile.save();
  res.status(200).send("File uploaded successfully!");
});

// 5. Get Shared Files Route
app.get("/api/shared-files", authenticate, async (req, res) => {
  const userFiles = await File.find({
    $or: [
      { uploadedBy: req.user.email },
      { sharedWith: { $in: [req.user.email] } },
    ],
  });

  res.json(userFiles);
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
