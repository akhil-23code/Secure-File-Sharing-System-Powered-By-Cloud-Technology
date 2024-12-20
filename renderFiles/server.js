// using express JS
var express = require("express");
var app = express();

const crypto = require("crypto");
require('dotenv').config();

// express formidable is used to parse the form data values
var formidable = require("express-formidable");
app.use(formidable());

// use mongo DB as database
var mongodb = require("mongodb");
var mongoClient = mongodb.MongoClient;

// the unique ID for each mongo DB document
var ObjectId = mongodb.ObjectId;

// receiving http requests
var httpObj = require("http");
var http = httpObj.createServer(app);

// to encrypt/decrypt passwords
var bcrypt = require("bcrypt");

// to store files
var fileSystem = require("fs");

// to start the session
var session = require("express-session");
app.use(session({
    secret: 'secret key',
    resave: false,
    saveUninitialized: false
}));

// define the publically accessible folders
app.use("/public/css", express.static(__dirname + "/public/css"));
app.use("/public/js", express.static(__dirname + "/public/js"));
app.use("/public/img", express.static(__dirname + "/public/img"));
app.use("/public/font-awesome-4.7.0", express.static(__dirname + "/public/font-awesome-4.7.0"));
app.use("/public/fonts", express.static(__dirname + "/public/fonts"));

// using EJS as templating engine
app.set("view engine", "ejs");

// main URL of website
var mainURL = "https://cloudhack-project.onrender.com";

// global database object
var database = null;

// Encryption and Decryption Constants
const algorithm = "aes-256-ctr";
const secretKey = process.env.SECRET_KEY || "your_secret_key";

// Encrypt Function
function encrypt(buffer) {
    const cipher = crypto.createCipher(algorithm, secretKey);
    const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
    return encrypted;
}

// Decrypt Function
function decrypt(buffer) {
    const decipher = crypto.createDecipher(algorithm, secretKey);
    const decrypted = Buffer.concat([decipher.update(buffer), decipher.final()]);
    return decrypted;
}


// app middleware to attach main URL and user object with each request
app.use(function (request, result, next) {
    request.mainURL = mainURL;
    request.isLogin = (typeof request.session.user !== "undefined");
    request.user = request.session.user;

    // continue the request
    next();
});

// recursive function to get the file from uploaded
function recursiveGetFile(files, _id) {
    var singleFile = null;

    for (var a = 0; a < files.length; a++) {
        const file = files[a];

        // return if file type is not folder and ID is found
        if (file.type != "folder") {
            if (file._id == _id) {
                return file;
            }
        }

        // if it is a folder and have files, then do the recursion
        if (file.type == "folder" && file.files.length > 0) {
            singleFile = recursiveGetFile(file.files, _id);
            // return the file if found in sub-folders
            if (singleFile != null) {
                return singleFile;
            }
        }
    }
}

// function to add new uploaded object and return the updated array
function getUpdatedArray(arr, _id, uploadedObj) {
    for (var a = 0; a < arr.length; a++) {
        // push in files array if type is folder and ID is found
        if (arr[a].type == "folder") {
            if (arr[a]._id == _id) {
                arr[a].files.push(uploadedObj);
                arr[a]._id = ObjectId(arr[a]._id);
            }

            // if it has files, then do the recursion
            if (arr[a].files.length > 0) {
                arr[a]._id = ObjectId(arr[a]._id);
                getUpdatedArray(arr[a].files, _id, uploadedObj);
            }
        }
    }

    return arr;
}

// recursive function to remove the file and return the updated array
function removeFileReturnUpdated(arr, _id) {
    for (var a = 0; a < arr.length; a++) {
        if (arr[a].type != "folder" && arr[a]._id == _id) {
            // remove the file from uploads folder
            try {
                fileSystem.unlinkSync(arr[a].filePath);
            } catch (exp) {
                // 
            }
            // remove the file from array
            arr.splice(a, 1);
            break;
        }

        // do the recursion if it has sub-folders
        if (arr[a].type == "folder" && arr[a].files.length > 0) {
            arr[a]._id = ObjectId(arr[a]._id);
            removeFileReturnUpdated(arr[a].files, _id);
        }
    }

    return arr;
}

// recursive function to search uploaded files
function recursiveSearch(files, query) {
    var singleFile = null;

    for (var a = 0; a < files.length; a++) {
        const file = files[a];

        if (file.type == "folder") {
            // search folder case-insensitive
            if (file.folderName.toLowerCase().search(query.toLowerCase()) > -1) {
                return file;
            }

            if (file.files.length > 0) {
                singleFile = recursiveSearch(file.files, query);
                if (singleFile != null) {
                    // need parent folder in case of files
                    if (singleFile.type != "folder") {
                        singleFile.parent = file;
                    }
                    return singleFile;
                }
            }
        } else {
            if (file.name.toLowerCase().search(query.toLowerCase()) > -1) {
                return file;
            }
        }
    }
}

// recursive function to search shared files
function recursiveSearchShared(files, query) {
    var singleFile = null;

    for (var a = 0; a < files.length; a++) {
        var file = (typeof files[a].file === "undefined") ? files[a] : files[a].file;

        if (file.type == "folder") {
            if (file.folderName.toLowerCase().search(query.toLowerCase()) > -1) {
                return file;
            }

            if (file.files.length > 0) {
                singleFile = recursiveSearchShared(file.files, query);
                if (singleFile != null) {
                    if (singleFile.type != "folder") {
                        singleFile.parent = file;
                    }
                    return singleFile;
                }
            }
        } else {
            if (file.name.toLowerCase().search(query.toLowerCase()) > -1) {
                return file;
            }
        }
    }
}

// start the http server
const mongoURI = process.env.MONGO_URI;
http.listen(3000, function () {
    console.log("Server started at " + mainURL);

    // connect with mongo DB server
    // mongoClient.connect("mongodb://localhost:27017", {
    mongoClient.connect(mongoURI, { useUnifiedTopology: true }, (error, client) => {
        if (error) {
            console.error("Database connection failed:", error);
        } else {
            database = client.db("file_transfer");
            console.log("Database connected.");
        }
        
        app.get("/pro-versions", function (request, result) {
            result.render("proVersions", {
                "request": request
            });
        });

        app.get("/Admin", async function (request, result) {
            // render an HTML page with number of pages, and posts data
            result.render("Admin", {
                request: request
            });
        });

        // search files or folders
        app.get("/Search", async function (request, result) {
            const search = request.query.search;

            if (request.session.user) {
                var user = await database.collection("users").findOne({
                    "_id": ObjectId(request.session.user._id)
                });
                var fileUploaded = await recursiveSearch(user.uploaded, search);
                var fileShared = await recursiveSearchShared(user.sharedWithMe, search);

                // check if file is uploaded or shared with user
                if (fileUploaded == null && fileShared == null) {
                    request.status = "error";
                    request.message = "File/folder '" + search + "' is neither uploaded nor shared with you.";

                    result.render("Search", {
                        "request": request
                    });
                    return false;
                }

                var file = (fileUploaded == null) ? fileShared : fileUploaded;
                file.isShared = (fileUploaded == null);
                result.render("Search", {
                    "request": request,
                    "file": file
                });

                return false;
            }

            result.redirect("/Login");
        });

        app.get("/Blog", async function (request, result) {
            // render an HTML page with number of pages, and posts data
            result.render("Blog", {
                request: request
            });
        });

        // Get all files shared with the logged-in user
app.get("/SharedWithMe", async function (request, result) {
    if (!request.session.user) {
        return result.redirect("/Login");
    }

    const user = await database.collection("users").findOne({
        _id: ObjectId(request.session.user._id)
    });

    const sharedFiles = user.sharedWithMe || []; // Retrieve files shared with the user

    result.render("SharedWithMe", {
        request,
        sharedFiles // Pass shared files to the frontend
    });
});


        app.post("/DeleteLink", async function (request, result) {

            const _id = request.fields._id;

            if (request.session.user) {
                var link = await database.collection("public_links").findOne({
                    $and: [{
                        "uploadedBy._id": ObjectId(request.session.user._id)
                    }, {
                        "_id": ObjectId(_id)
                    }]
                });

                if (link == null) {
                    request.session.status = "error";
                    request.session.message = "Link does not exists.";

                    const backURL = request.header("Referer") || "/";
                    result.redirect(backURL);
                    return false;
                }

                await database.collection("public_links").deleteOne({
                    $and: [{
                        "uploadedBy._id": ObjectId(request.session.user._id)
                    }, {
                        "_id": ObjectId(_id)
                    }]
                });

                request.session.status = "success";
                request.session.message = "Link has been deleted.";

                const backURL = request.header("Referer") || "/";
                result.redirect(backURL);
                return false;
            }

            result.redirect("/Login");
        });

        app.get("/MySharedLinks", async function (request, result) {
            if (request.session.user) {
                var links = await database.collection("public_links").find({
                    "uploadedBy._id": ObjectId(request.session.user._id)
                }).toArray();

                result.render("MySharedLinks", {
                    "request": request,
                    "links": links
                });
                return false;
            }

            result.redirect("/Login");
        });

        app.get("/SharedViaLink/:hash", async function (request, result) {
            const hash = request.params.hash;

            const link = await database.collection("public_links").findOne({ hash });

            if (!link) {
                request.session.status = "error";
                request.session.message = "Link has expired or does not exist.";
                return result.redirect("/");
            }

            const file = await database.collection("files").findOne({
                _id: ObjectId(link.fileId),
            });

            if (!file) {
                request.session.status = "error";
                request.session.message = "File not found.";
                return result.redirect("/");
            }

            // Decrypt the file data
            const decryptedFile = decrypt(file.data);

            // Send the file to the client
            result.setHeader("Content-Disposition", `attachment; filename="${file.name}"`);
            result.setHeader("Content-Type", file.type);
            result.send(decryptedFile);
        });


        app.post("/ShareViaLink", async function (request, result) {
    const _id = request.fields._id; // File ID
    const sharedWithUsername = request.fields.sharedWith; // Username of the recipient

    if (request.session.user) {
        const user1 = await database.collection("users").findOne({
            "_id": ObjectId(request.session.user._id)
        });

        const file = await database.collection("files").findOne({
            _id: ObjectId(_id)
        });

        if (!file) {
            request.session.status = "error";
            request.session.message = "File does not exist.";
            return result.redirect("/MyUploads");
        }

        const user2 = await database.collection("users").findOne({
            username: sharedWithUsername
        });

        if (!user2) {
            request.session.status = "error";
            request.session.message = "The user you are sharing with does not exist.";
            return result.redirect("/MyUploads");
        }

        const hash = crypto.randomBytes(16).toString("hex"); // Generate unique hash
        const link = `${request.mainURL}/SharedViaLink/${hash}`;

        // Save the sharable link in the `public_links` collection
        await database.collection("public_links").insertOne({
            hash,
            file,
            uploadedBy: {
                _id: user1._id,
                email: user1.email,
            },
            sharedWith: {
                _id: user2._id,
                username: sharedWithUsername,
            },
            createdAt: new Date(),
        });

        // Add the file to the `sharedWithMe` array of User 2
        await database.collection("users").updateOne(
            { _id: user2._id },
            {
                $push: {
                    sharedWithMe: {
                        _id: file._id,
                        name: file.name,
                        type: file.type,
                        size: file.size,
                        sharedBy: user1.username,
                        sharedAt: new Date(),
                    },
                },
            }
        );

        request.session.status = "success";
        request.session.message = `Sharable link: ${link}`;
        return result.redirect("/MySharedLinks");
    }

    result.redirect("/Login");
});

        


        // delete uploaded file
        app.post("/DeleteFile", async function (request, result) {
            const _id = request.fields._id;

            if (request.session.user) {
                var user = await database.collection("users").findOne({
                    "_id": ObjectId(request.session.user._id)
                });

                var updatedArray = await removeFileReturnUpdated(user.uploaded, _id);
                for (var a = 0; a < updatedArray.length; a++) {
                    updatedArray[a]._id = ObjectId(updatedArray[a]._id);
                }

                await database.collection("users").updateOne({
                    "_id": ObjectId(request.session.user._id)
                }, {
                    $set: {
                        "uploaded": updatedArray
                    }
                });

                const backURL = request.header('Referer') || '/';
                result.redirect(backURL);
                return false;
            }

            result.redirect("/Login");
        });

        // download file
        app.post("/DownloadFile", async function (request, result) {
            const _id = request.fields._id;

            var link = await database.collection("public_links").findOne({
                "file._id": ObjectId(_id)
            });

            if (link != null) {
                fileSystem.readFile(link.file.filePath, function (error, data) {
                    // console.log(error);

                    result.json({
                        "status": "success",
                        "message": "Data has been fetched.",
                        "arrayBuffer": data,
                        "fileType": link.file.type,
                        // "file": mainURL + "/" + file.filePath,
                        "fileName": link.file.name
                    });
                });
                return false;
            }

            if (request.session.user) {

                var user = await database.collection("users").findOne({
                    "_id": ObjectId(request.session.user._id)
                });

                var fileUploaded = await recursiveGetFile(user.uploaded, _id);

                if (fileUploaded == null) {
                    result.json({
                        "status": "error",
                        "message": "File is neither uploaded nor shared with you."
                    });
                    return false;
                }

                var file = fileUploaded;

                fileSystem.readFile(file.filePath, function (error, data) {
                    // console.log(error);

                    result.json({
                        "status": "success",
                        "message": "Data has been fetched.",
                        "arrayBuffer": data,
                        "fileType": file.type,
                        // "file": mainURL + "/" + file.filePath,
                        "fileName": file.name
                    });
                });
                return false;
            }

            result.json({
                "status": "error",
                "message": "Please login to perform this action."
            });
            return false;
        });

        // view all files uploaded by logged-in user
         // view all files uploaded by logged-in user
        app.get("/MyUploads", async function (request, result) {
            if (request.session.user) {

                var user = await database.collection("users").findOne({
                    "_id": ObjectId(request.session.user._id)
                });

                const uploadedFiles = await database.collection("files").find({
                    "uploadedBy._id": user._id
                }).toArray();

                result.render("MyUploads", {
                    "request": request,
                    "uploaded": uploadedFiles
                });
                return false;
            }

            result.redirect("/Login");
        });

        // upload new file
        app.post("/UploadFile", async function (request, result) {
            if (request.session.user) {
                const user = await database.collection("users").findOne({
                    "_id": ObjectId(request.session.user._id)
                });

                if (request.files.file.size > 0) {
                    const fileBuffer = fileSystem.readFileSync(request.files.file.path);

                    // Encrypt the file
                    const encryptedFile = encrypt(fileBuffer);

                    // Prepare file metadata
                    const uploadedObj = {
                        _id: ObjectId(),
                        size: request.files.file.size,
                        name: request.files.file.name,
                        type: request.files.file.type,
                        encrypted: true, // Indicate the file is encrypted
                        createdAt: new Date().getTime(),
                    };

                    // Save the encrypted file to MongoDB
                    await database.collection("files").insertOne({
                        ...uploadedObj,
                        data: encryptedFile,
                        uploadedBy: {
                            _id: user._id,
                            email: user.email,
                        },
                    });

                    // Update the `user.uploaded` array
                    await database.collection("users").updateOne(
                        { "_id": ObjectId(request.session.user._id) },
                        { $push: { uploaded: uploadedObj } }
                    );

                    // Remove temporary file
                    fileSystem.unlinkSync(request.files.file.path);

                    request.session.status = "success";
                    request.session.message = "File has been uploaded and encrypted.";
                    return result.redirect("/MyUploads");
                }

                request.session.status = "error";
                request.session.message = "Please select a valid file.";
                return result.render("MyUploads", { request });
            }

            result.redirect("/Login");
        });


        // logout the user
        app.get("/Logout", function (request, result) {
            request.session.destroy();
            result.redirect("/");
        });

        // show page to login
        app.get("/Login", function (request, result) {
            result.render("Login", {
                "request": request
            });
        });

        // authenticate the user
        app.post("/Login", async function (request, result) {
            var email = request.fields.email;
            var password = request.fields.password;

            var user = await database.collection("users").findOne({
                "email": email
            });

            if (user == null) {
                request.status = "error";
                request.message = "Email does not exist.";
                result.render("Login", {
                    "request": request
                });

                return false;
            }

            bcrypt.compare(password, user.password, function (error, isVerify) {
                if (isVerify) {
                    request.session.user = user;
                    result.redirect("/");

                    return false;
                }

                request.status = "error";
                request.message = "Password is not correct.";
                result.render("Login", {
                    "request": request
                });
            });
        });

        // register the user
        app.post("/Register", async function (request, result) {

            var name = request.fields.name;
            var email = request.fields.email;
            var password = request.fields.password;
            var reset_token = "";
            var isVerified = true;
            var verification_token = new Date().getTime();

            var user = await database.collection("users").findOne({
                "email": email
            });

            if (user == null) {
                bcrypt.hash(password, 10, async function (error, hash) {
                    await database.collection("users").insertOne({
                        "name": name,
                        "email": email,
                        "password": hash,
                        "reset_token": reset_token,
                        "uploaded": [],
                        "sharedWithMe": [],
                        "isVerified": isVerified,
                        "verification_token": verification_token
                    }, async function (error, data) {

                        request.status = "success";
                        request.message = "Signed up successfully. You can login now.";

                        result.render("Register", {
                            "request": request
                        });

                    });
                });
            } else {
                request.status = "error";
                request.message = "Email already exist.";

                result.render("Register", {
                    "request": request
                });
            }
        });

        // show page to do the registration
        app.get("/Register", function (request, result) {
            result.render("Register", {
                "request": request
            });
        });

        // home page
        app.get("/", function (request, result) {
            result.render("index", {
                "request": request
            });
        });
    });
});
