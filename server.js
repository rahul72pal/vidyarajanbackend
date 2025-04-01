import express from "express";
import mysql from "mysql2";
import multer from "multer";
import cors from "cors";
import path from "path";
import dotenv from "dotenv";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import fs from "fs";
import { fileURLToPath } from "url"; // Fix for __dirname in ES modules

// Load environment variables
dotenv.config();

// Fix __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Ensure 'uploads' directory exists
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Middleware
app.use(express.json());
app.use(cors());
app.use("/uploads", express.static(uploadDir));

// MySQL Connection Pool
const db = mysql.createPool({
  connectionLimit: 10,
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: null,
  database: process.env.DB_NAME,
});

db.getConnection((err, connection) => {
  if (err) {
    console.error("❌ Database connection failed:", err);
    process.exit(1);
  }
  console.log("✅ Connected to MySQL Database");
  connection.release();
});

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});
const upload = multer({ storage });
//login
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const checkUser = "SELECT * FROM users WHERE email = ?";
    db.query(checkUser, [email], async (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      if (results.length === 0) {
        return res.status(400).json({ error: "Invalid email or password" });
      }

      const user = results[0];
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(400).json({ error: "Invalid email or password" });
      }

      res.json({ message: "Login successful", user });
    });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});

// ✅ Register User
app.post("/register", async (req, res) => {
  try {
    const { fullName, email, password } = req.body;
    if (!fullName || !email || !password) {
      return res.status(400).json({ error: "All fields are required" });
    }

    // Check if user already exists
    const checkUser = "SELECT * FROM users WHERE email = ?";
    db.query(checkUser, [email], async (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      if (results.length > 0) {
        return res.status(400).json({ error: "Email already in use" });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);
      const sql = "INSERT INTO users (fullName, email, password) VALUES (?, ?, ?)";

      db.query(sql, [fullName, email, hashedPassword], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ message: "User registered successfully" });
      });
    });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});

// ✅ Login User
app.post("/api/banner", upload.single("image"), (req, res) => {
  const { text } = req.body;
  const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

  if (!text || !imageUrl) {
    return res.status(400).json({ error: "Text and image are required." });
  }

  const sql = "INSERT INTO banners (text, image_url) VALUES (?, ?)";
  db.query(sql, [text, imageUrl], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: "Banner saved successfully!", banner: { id: result.insertId, text, imageUrl } });
  });
});

// ✅ Fetch Banners
app.get("/api/banners", (req, res) => {
  console.log("➡️ Banner route hit");
  const sql = "SELECT * FROM banners ORDER BY id DESC";
  db.query(sql, (err, results) => {
      if (err) {
          console.error("❌ Database Error:", err);
          return res.status(500).json({ error: "Failed to fetch banners" });
      }
      console.log("✅ Banner data sent:", results); // Verify JSON response
      res.json(results);
  });
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));




// ✅ Delete Banner
app.delete("/api/banner/:id", (req, res) => {
  const { id } = req.params;

  const getImageSql = "SELECT image_url FROM banners WHERE id = ?";
  db.query(getImageSql, [id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (results.length === 0) return res.status(404).json({ error: "Banner not found" });

    const imagePath = path.join(__dirname, "public", results[0].image_url);

    const deleteSql = "DELETE FROM banners WHERE id = ?";
    db.query(deleteSql, [id], (err, result) => {
      if (err) return res.status(500).json({ error: err.message });

      fs.unlink(imagePath, (unlinkErr) => {
        if (unlinkErr) console.error("Error deleting image file:", unlinkErr);
      });
      res.json({ message: "Banner deleted successfully!" });
    });
  });
});
//Popular Course
// Routes
app.get("/courses", (req, res) => {
  db.query("SELECT * FROM courses", (err, results) => {
    if (err) return res.status(500).json(err);

    // Format data to match frontend requirements
    const formattedCourses = results.map(course => ({
      ...course,
      color: `bg-[${course.color}]`, // Ensure proper Tailwind syntax
      icon: course.icon || "📘" // Default icon if none is provided
    }));

    res.json(formattedCourses);
  });
});


app.post("/courses", (req, res) => {
  const { name, description } = req.body;
  db.query("INSERT INTO courses (name, description) VALUES (?, ?)", [name, description], (err, result) => {
    if (err) return res.status(500).json(err);
    res.status(201).json({ id: result.insertId, name, description });
  });
});

app.put("/courses/:id", (req, res) => {
  const { id } = req.params;
  const { name, description } = req.body;
  db.query("UPDATE courses SET name = ?, description = ? WHERE id = ?", [name, description, id], (err) => {
    if (err) return res.status(500).json(err);
    res.json({ id, name, description });
  });
});

app.delete("/courses/:id", (req, res) => {
  const { id } = req.params;
  db.query("DELETE FROM courses WHERE id = ?", [id], (err) => {
    if (err) return res.status(500).json(err);
    res.json({ message: "Course deleted" });
  });
});
//Explore Courses
// 1️⃣ **Get All Courses (with Search, Filter & Pagination)**
app.get("/explorecourse", (req, res) => {
  let { page, limit, search } = req.query;
  
  page = parseInt(page) || 1;
  limit = parseInt(limit) || 10;
  const offset = (page - 1) * limit;

  let sql = "SELECT * FROM explorecourses WHERE 1=1";
  let params = [];

  if (search) {
    sql += " AND name LIKE ?";
    params.push(`%${search}%`);
  }

  sql += " LIMIT ? OFFSET ?";
  params.push(limit, offset);

  db.query(sql, params, (err, results) => {
    if (err) return res.status(500).json({ error: err.message });

    res.json({
      page,
      limit,
      totalCourses: results.length,
      courses: results,
    });
  });
});


// 2️⃣ **Add a New Course (With Image Upload)**
app.post("/explorecourse", upload.single("image"), (req, res) => {
//  console.log(req.body); // Debugging: Check received form data
  //console.log(req.file); // Debugging: Check uploaded file

  const { name, description } = req.body;
  const image = req.file ? `/uploads/${req.file.filename}` : null;

  if (!name || !description || !image) {
    return res.status(400).json({ error: "All fields are required" });
  }

  const sql = "INSERT INTO explorecourses (name, description, image) VALUES (?, ?, ?)";
  db.query(sql, [name, description, image], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });

    res.status(201).json({
      id: result.insertId,
      name,
      description,
      image,
    });
  });
});



// 3️⃣ **Delete a Course**
app.delete("/explorecourse/:id", (req, res) => {
  const { id } = req.params;
  
  db.query("SELECT * FROM explorecourses WHERE id = ?", [id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });

    if (results.length === 0) {
      return res.status(404).json({ error: "Course not found" });
    }

    db.query("DELETE FROM explorecourses WHERE id = ?", [id], (err) => {
      if (err) return res.status(500).json({ error: err.message });

      res.json({ message: "Course deleted successfully" });
    });
  });
});

//Free Demo
// 2️⃣ **Get the Latest Demo Data**
app.get("/bookfree/demo", (req, res) => {
  const sql = "SELECT * FROM demo ORDER BY id DESC LIMIT 1";
  db.query(sql, (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(result[0] || {}); // Send the latest demo entry
  });
});

// 3️⃣ **Add/Update Demo Data**
app.post("/bookfree/demo", upload.single("image"), (req, res) => {
  const { text } = req.body;
  const image = req.file ? `/uploads/${req.file.filename}` : null;

  if (!text || !image) {
    return res.status(400).json({ error: "Text and image are required" });
  }

  const sql = "INSERT INTO demo (text, image) VALUES (?, ?) ON DUPLICATE KEY UPDATE text=?, image=?";
  db.query(sql, [text, image, text, image], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: "Demo saved successfully!" });
  });
});

// 4️⃣ **Delete Demo**
app.delete("/bookfree/demo/:id", (req, res) => {
  const { id } = req.params;
  db.query("DELETE FROM demo WHERE id = ?", [id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: "Demo deleted successfully!" });
  });
});


//New On Vidyarajan
// 📌 **3️⃣ Get All Courses (New on Vidyarjan)**
app.get("/newonvidyarajan", (req, res) => {
  const sql = "SELECT * FROM newonvidyarajan ORDER BY id DESC";
  db.query(sql, (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(result);
  });
});

// 📌 **4️⃣ Add New Course**
app.post("/newonvidyarajan", upload.single("image"), (req, res) => {
  const { title, description } = req.body;
  const image = req.file ? `/uploads/${req.file.filename}` : null;

  if (!title || !description || !image) {
    return res.status(400).json({ error: "All fields are required!" });
  }

  const sql = "INSERT INTO newonvidyarajan (title, description, image) VALUES (?, ?, ?)";
  db.query(sql, [title, description, image], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: "✅ Course added successfully!" });
  });
});

// 📌 **5️⃣ Delete a Course**
app.delete("/newonvidyarajan/:id", (req, res) => {
  const { id } = req.params;
  const sql = "DELETE FROM newonvidyarajan WHERE id = ?";
  db.query(sql, [id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: "✅ Course deleted successfully!" });
  });
});

//Best Selling  Product

// ✅ GET: Fetch All Products
app.get("/bestsellingproducts", (req, res) => {
  db.query("SELECT * FROM best_selling_products", (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// ✅ POST: Add a New Product
app.post("/bestsellingproducts", upload.single("image"), (req, res) => {
  const { name, price } = req.body;
  const image = req.file ? `/uploads/${req.file.filename}` : null;

  if (!name || !price || !image) {
    return res.status(400).json({ error: "All fields are required!" });
  }

  db.query(
    "INSERT INTO best_selling_products (name, price, image) VALUES (?, ?, ?)",
    [name, price, image],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: "✅ Product added successfully!" });
    }
  );
});

// ✅ DELETE: Remove a Product
app.delete("/bestsellingproducts/:id", (req, res) => {
  const { id } = req.params;
  db.query("DELETE FROM best_selling_products WHERE id = ?", [id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: "✅ Product deleted successfully!" });
  });
});


//Student Story
// 📌 Route to GET all students
app.get("/students", (req, res) => {
  const query = "SELECT name, score, image, category FROM students";
  db.query(query, (err, results) => {
    if (err) {
      return res.status(500).json({ error: "Database query error" });
    }
    res.json(results);
  });
});


// 📌 Route to ADD a student
app.post("/students", upload.single("photo"), (req, res) => {
  const { name, achievement } = req.body;
  const photoPath = req.file ? `/uploads/${req.file.filename}` : null;

  if (!name || !achievement || !photoPath) {
    return res.status(400).json({ error: "All fields are required" });
  }

  const query = "INSERT INTO students (name, achievement, photo) VALUES (?, ?, ?)";
  db.query(query, [name, achievement, photoPath], (err, result) => {
    if (err) {
      return res.status(500).json({ error: "Error inserting student data" });
    }
    res.json({ id: result.insertId, name, achievement, photo: photoPath });
  });
});

// 📌 Route to DELETE a student
app.delete("/students/:id", (req, res) => {
  const { id } = req.params;

  // Fetch student to get photo path
  db.query("SELECT photo FROM students WHERE id = ?", [id], (err, results) => {
    if (err || results.length === 0) {
      return res.status(404).json({ error: "Student not found" });
    }

    const photoPath = results[0].photo;
    if (photoPath) {
      fs.unlinkSync("." + photoPath); // Delete the file
    }

    db.query("DELETE FROM students WHERE id = ?", [id], (err) => {
      if (err) {
        return res.status(500).json({ error: "Error deleting student" });
      }
      res.json({ message: "✅ Student deleted successfully" });
    });
  });
});


//Story Inspire
// 🚀 Fetch All Stories
app.get("/stories", (req, res) => {
  db.query("SELECT * FROM stories", (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// 🚀 Add a New Story
app.post("/stories", upload.single("image"), (req, res) => {
  const { title, description } = req.body;
  const imagePath = req.file ? `/uploads/${req.file.filename}` : null;

  if (!title || !description || !imagePath) {
    return res.status(400).json({ error: "All fields are required" });
  }

  db.query(
    "INSERT INTO stories (title, description, image) VALUES (?, ?, ?)",
    [title, description, imagePath],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: result.insertId, title, description, image: imagePath });
    }
  );
});

// 🚀 Delete a Story
app.delete("/stories/:id", (req, res) => {
  const { id } = req.params;
  db.query("DELETE FROM stories WHERE id = ?", [id], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: "Story deleted successfully" });
  });
});


//Update Course
// 🔹 POST - Add Course
app.post("/add-course", upload.single("image"), (req, res) => {
  const { name, price, description } = req.body;
  const imagePath = req.file ? `/uploads/${req.file.filename}` : null;

  if (!name || !price || !description) {
    return res.status(400).json({ message: "All fields are required!" });
  }

  const sql = "INSERT INTO courseupdate (name, price, description, image) VALUES (?, ?, ?, ?)";
  db.query(sql, [name, price, description, imagePath], (err, result) => {
    if (err) {
      console.error("Error inserting course:", err);
      return res.status(500).json({ message: "Server Error", error: err });
    }
    res.status(201).json({ id: result.insertId, name, price, description, image: imagePath });
  });
});

// 🔹 GET - Fetch All Courses
app.get("/get-courses", (req, res) => {
  const sql = "SELECT * FROM courseupdate";
  db.query(sql, (err, results) => {
    if (err) {
      console.error("Error fetching courses:", err);
      return res.status(500).json({ message: "Server Error", error: err });
    }
    res.json(results);
  });
});

// 🔹 DELETE - Remove Course
app.delete("/delete-course/:id", (req, res) => {
  const { id } = req.params;
  const sql = "DELETE FROM courseupdate WHERE id = ?";
  db.query(sql, [id], (err, result) => {
    if (err) {
      console.error("Error deleting course:", err);
      return res.status(500).json({ message: "Server Error", error: err });
    }
    res.json({ message: "Course deleted successfully" });
  });
});


//Assigment
// 🔹 POST - Upload Assignment
app.post("/upload-assignment", upload.single("file"), (req, res) => {
  const { title, description } = req.body;
  const filePath = req.file ? `/uploads/${req.file.filename}` : null;

  if (!title || !description || !filePath) {
    return res.status(400).json({ message: "All fields are required!" });
  }

  const sql = "INSERT INTO assignments (title, description, file_path) VALUES (?, ?, ?)";
  db.query(sql, [title, description, filePath], (err, result) => {
    if (err) {
      console.error("Error inserting assignment:", err);
      return res.status(500).json({ message: "Server Error", error: err });
    }
    res.status(201).json({ id: result.insertId, title, description, file: filePath });
  });
});

// 🔹 GET - Fetch All Assignments
app.get("/get-assignments", (req, res) => {
  const sql = "SELECT * FROM assignments";
  db.query(sql, (err, results) => {
    if (err) {
      console.error("Error fetching assignments:", err);
      return res.status(500).json({ message: "Server Error", error: err });
    }
    res.json(results);
  });
});

// 🔹 DELETE - Remove Assignment
app.delete("/delete-assignment/:id", (req, res) => {
  const { id } = req.params;
  const sql = "DELETE FROM assignments WHERE id = ?";
  db.query(sql, [id], (err, result) => {
    if (err) {
      console.error("Error deleting assignment:", err);
      return res.status(500).json({ message: "Server Error", error: err });
    }
    res.json({ message: "Assignment deleted successfully" });
  });
});

//Announcement
// ✅ API: Get All Announcements
app.get("/get-announcements", (req, res) => {
  db.query("SELECT * FROM announcements ORDER BY created_at DESC", (err, results) => {
    if (err) {
      res.status(500).json({ error: "Database error" });
    } else {
      res.json(results);
    }
  });
});

// ✅ API: Add New Announcement
app.post("/add-announcement", (req, res) => {
  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ error: "Message is required" });
  }

  db.query("INSERT INTO announcements (message) VALUES (?)", [message], (err, result) => {
    if (err) {
      res.status(500).json({ error: "Database error" });
    } else {
      res.json({ id: result.insertId, message, created_at: new Date() });
    }
  });
});

// ✅ API: Delete Announcement
app.delete("/delete-announcement/:id", (req, res) => {
  const { id } = req.params;

  db.query("DELETE FROM announcements WHERE id = ?", [id], (err, result) => {
    if (err) {
      res.status(500).json({ error: "Database error" });
    } else {
      res.json({ message: "Announcement deleted successfully" });
    }
  });
});
//Message
// POST - Save a message
app.post("/messages", (req, res) => {
  const { first_name, last_name, email, phone, message } = req.body;
  if (!first_name || !last_name || !email || !message) {
    return res.status(400).json({ error: "All fields are required!" });
  }

  const sql = "INSERT INTO messages (first_name, last_name, email, phone, message) VALUES (?, ?, ?, ?, ?)";
  db.query(sql, [first_name, last_name, email, phone, message], (err, result) => {
    if (err) {
      console.error("Error inserting message:", err);
      res.status(500).json({ error: "Database error" });
    } else {
      res.status(201).json({ message: "Message received successfully!" });
    }
  });
});

// GET - Fetch all messages
app.get("/messages", (req, res) => {
  db.query("SELECT * FROM messages ORDER BY created_at DESC", (err, results) => {
    if (err) {
      console.error("Error fetching messages:", err);
      res.status(500).json({ error: "Database error" });
    } else {
      res.json(results);
    }
  });
});
//Update Address
// GET request - Fetch admin details
// GET Route - Fetch data
app.get('/api/details', (req, res) => {
  const sql = 'SELECT * FROM admin_details LIMIT 1';
  db.query(sql, (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(result[0]);
  });
});

// POST Route - Update data
app.post('/api/update', (req, res) => {
  const { address, timing, contact, courseDetails, price } = req.body;

  const sql = `
      UPDATE admin_details 
      SET address = ?, timing = ?, contact = ?, courseDetails = ?, price = ?
      WHERE id = 1
  `;

  db.query(sql, [address, timing, contact, courseDetails, price], (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, message: '✅ Details updated successfully!' });
  });
});
//update banner popular product
// Upload banner route
// Upload Banner Route
app.post("/api/v1/banner/upload", upload.single("image"), (req, res) => {
  if (!req.file) {
      return res.status(400).json({ error: "No file uploaded." });
  }

  const imageUrl = `/uploads/${req.file.filename}`; // ✅ Fixed Path

  const query = "INSERT INTO vidyarajan_banners (image_url) VALUES (?)";
  db.query(query, [imageUrl], (err, result) => {
      if (err) {
          console.error("❌ Error inserting banner:", err);
          return res.status(500).json({ error: "Failed to save banner." });
      }

      res.json({ 
          message: "✅ Banner uploaded successfully", 
          banner: { id: result.insertId, image_url: imageUrl } 
      });
  });
});

// Fetch Banners Route
app.get("/api/v1/banner/all", (req, res) => {
  const query = "SELECT * FROM vidyarajan_banners";
  db.query(query, (err, results) => {
      if (err) {
          console.error("❌ Error fetching banners:", err);
          return res.status(500).json({ error: "Failed to fetch banners." });
      }

      // Ensure correct URL format in frontend
      const banners = results.map(banner => ({
          ...banner,
          image_url: `http://localhost:5000${banner.image_url}`
      }));

      res.json(banners);
  });
});

// Delete Banner Route
app.delete("/api/v1/banner/delete/:id", (req, res) => {
  const { id } = req.params;

  const getImageQuery = "SELECT image_url FROM vidyarajan_banners WHERE id = ?";
  db.query(getImageQuery, [id], (err, result) => {
      if (err || result.length === 0) {
          return res.status(404).json({ error: "Banner not found." });
      }

      const imagePath = path.join(__dirname, result[0].image_url.replace("/uploads", "uploads"));

      // Delete file from filesystem
      fs.unlink(imagePath, (err) => {
          if (err) console.error("Failed to delete image file:", err);
      });

      const deleteQuery = "DELETE FROM vidyarajan_banners WHERE id = ?";
      db.query(deleteQuery, [id], (err) => {
          if (err) {
              console.error("❌ Error deleting banner:", err);
              return res.status(500).json({ error: "Failed to delete banner." });
          }

          res.json({ message: "✅ Banner deleted successfully" });
      });
  });
});
//Title update
// Fetch Title

// GET Route for fetching the title
app.get('/api/title', (req, res) => {
  const query = 'SELECT title, subtitle FROM titles LIMIT 1';

  db.query(query, (err, results) => {
      if (err) {
          console.error('Error fetching title:', err);
          return res.status(500).json({ error: 'Failed to fetch title data' });
      }

      if (results.length === 0) {
          // Insert default data if no data exists
          const insertQuery = 'INSERT INTO titles (id, title, subtitle) VALUES (1, "Default Title", "Default Subtitle")';
          db.query(insertQuery, (insertErr) => {
              if (insertErr) {
                  console.error('Error inserting default title:', insertErr);
                  return res.status(500).json({ error: 'Failed to insert default title data' });
              }

              return res.json({ title: 'Default Title', subtitle: 'Default Subtitle' });
          });
      } else {
          res.json(results[0]);  // Return fetched data
      }
  });
});



// POST Route for updating the title
// POST Route for updating the title
app.post('/api/title', (req, res) => {
  const { title, subtitle } = req.body;

  if (!title || !subtitle) {
      return res.status(400).json({ error: 'Title and subtitle are required.' });
  }

  const query = 'UPDATE titles SET title = ?, subtitle = ? WHERE id = 1';

  db.query(query, [title, subtitle], (err, results) => {
      if (err) {
          console.error('Error updating title:', err);
          return res.status(500).json({ error: 'Failed to update title data' });
      }

      res.json({ message: 'Title updated successfully!' });
  });
});
//Price Update
// Route to fetch price details
app.get('/api/price', (req, res) => {
  const query = 'SELECT * FROM prices ORDER BY id DESC LIMIT 1';
  db.query(query, (err, result) => {
      if (err) {
          console.error('Error fetching data:', err);
          return res.status(500).json({ error: 'Failed to fetch price data' });
      }
      res.json(result[0] || { message: 'No price data found' });
  });
});

// Route to update or insert price details
app.post('/api/price', (req, res) => {
  const { originalPrice, discount, duration, finalPrice, emiOption } = req.body;

  if (!originalPrice || !discount || !duration || !finalPrice || !emiOption) {
      return res.status(400).json({ error: 'All fields are required' });
  }

  const query = `
      INSERT INTO prices (original_price, discount, duration, final_price, emi_option)
      VALUES (?, ?, ?, ?, ?)
  `;

  db.query(
      query,
      [originalPrice, discount, duration, finalPrice, emiOption],
      (err) => {
          if (err) {
              console.error('Error inserting data:', err);
              return res.status(500).json({ error: 'Failed to save price data' });
          }
          res.json({ message: 'Price details updated successfully!' });
      }
  );
});
//Neet banner
// Upload NEET Banner


// Upload NEET Banner
// NEET Banner Upload Route
// NEET Banner Upload Route
// Fetch current banner
// Fetch the current banner
app.get("/api/banner", (req, res) => {
  db.query("SELECT image_path FROM banner LIMIT 1", (err, result) => {
    if (err) return res.status(500).json({ error: "Database error" });
    if (result.length === 0) return res.json({ image_path: null });
    res.json({ image_path: `http://localhost:5000/${result[0].image_path}` });
  });
});

// Upload a new banner
app.post("/api/banner/upload", upload.single("bannerImage"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const imagePath = `uploads/${req.file.filename}`;

  db.query("DELETE FROM banner", (err) => {
    if (err) return res.status(500).json({ error: "Failed to clear old banner" });

    db.query("INSERT INTO banner (image_path) VALUES (?)", [imagePath], (err) => {
      if (err) return res.status(500).json({ error: "Failed to save image" });

      res.json({ message: "Banner uploaded successfully", imagePath: `http://localhost:5000/${imagePath}` });
    });
  });
});

// Delete the banner
app.delete("/api/banner/delete", (req, res) => {
  db.query("SELECT image_path FROM banner LIMIT 1", (err, result) => {
    if (err) return res.status(500).json({ error: "Database error" });

    if (result.length === 0) return res.status(404).json({ error: "No banner found" });

    const imagePath = result[0].image_path;

    db.query("DELETE FROM banner", (err) => {
      if (err) return res.status(500).json({ error: "Failed to delete banner" });

      fs.unlink(imagePath, (err) => {
        if (err && err.code !== "ENOENT") return res.status(500).json({ error: "Failed to delete image file" });

        res.json({ message: "Banner deleted successfully" });
      });
    });
  });
});
//neetdetails
// ✅ Fetch NEET Details (GET)
app.get("/api/neet-details", (req, res) => {
  const query = "SELECT * FROM neet_details ORDER BY id DESC LIMIT 1";
  
  db.query(query, (err, result) => {
    if (err) {
      console.error("❌ Error fetching NEET details:", err);
      return res.status(500).json({ error: "Database error" });
    }

    if (result.length === 0) {
      return res.json({ message: "No NEET details found!", data: null });
    }

    res.json({ message: "✅ NEET details fetched successfully!", data: result[0] });
  });
});

// ✅ Add or Update NEET Details (POST)
app.post("/api/neet-details", (req, res) => {
  const { address, timing, contact, courseDetails, price } = req.body;

  if (!address || !timing || !contact || !courseDetails || !price) {
    return res.status(400).json({ error: "All fields are required!" });
  }

  const query = `
    INSERT INTO neet_details (id, address, timing, contact, courseDetails, price)
    VALUES (1, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
    address = VALUES(address),
    timing = VALUES(timing),
    contact = VALUES(contact),
    courseDetails = VALUES(courseDetails),
    price = VALUES(price)
  `;

  db.query(query, [address, timing, contact, courseDetails, price], (err) => {
    if (err) {
      console.error("❌ Error updating NEET details:", err);
      return res.status(500).json({ error: "Failed to update details" });
    }

    res.json({ message: "✅ NEET details updated successfully!" });
  });
});

//neet details
// ✅ Fetch the Latest NEET Title
app.get("/neet/api/title", (req, res) => {
  const sql = "SELECT * FROM neet_titles ORDER BY updated_at DESC LIMIT 1";
  db.query(sql, (err, result) => {
    if (err) {
      console.error("❌ Error fetching title:", err);
      return res.status(500).json({ error: "Internal Server Error" });
    }
    if (result.length === 0) {
      return res.status(404).json({ message: "No NEET title data found" });
    }
    res.json(result[0]);
  });
});

// ✅ Update or Insert NEET Title
app.post("/neet/api/title", (req, res) => {
  const { title, subtitle } = req.body;
  if (!title || !subtitle) {
    return res.status(400).json({ error: "Title and Subtitle are required" });
  }

  const sql = `
    INSERT INTO neet_titles (title, subtitle) 
    VALUES (?, ?) 
    ON DUPLICATE KEY UPDATE 
    title = VALUES(title), 
    subtitle = VALUES(subtitle), 
    updated_at = NOW()
  `;

  db.query(sql, [title, subtitle], (err, result) => {
    if (err) {
      console.error("❌ Error updating title:", err);
      return res.status(500).json({ error: "Failed to update title" });
    }
    res.json({ message: "Title updated successfully" });
  });
});
//Neet price
// Fetch NEET price details
app.get("/api/neet-update-price", (req, res) => {
  const query = "SELECT * FROM neet_price ORDER BY id DESC LIMIT 1"; // Get latest price entry
  db.query(query, (err, result) => {
      if (err) {
          console.error("Error fetching NEET price:", err);
          return res.status(500).json({ error: "Internal Server Error" });
      }
      if (result.length === 0) {
          return res.json({ message: "No price details found" });
      }
      res.json(result[0]);
  });
});

// Update NEET price details
app.post("/api/neet-update-price", (req, res) => {
  const { originalPrice, discount, duration, finalPrice, emiOption } = req.body;

  if (!originalPrice || !discount || !duration || !finalPrice || !emiOption) {
      return res.status(400).json({ error: "All fields are required" });
  }

  const query = "INSERT INTO neet_price (original_price, discount, duration, final_price, emi_option) VALUES (?, ?, ?, ?, ?)";
  const values = [originalPrice, discount, duration, finalPrice, emiOption];

  db.query(query, values, (err, result) => {
      if (err) {
          console.error("Error updating NEET price:", err);
          return res.status(500).json({ error: "Failed to update price" });
      }
      res.json({ message: "Price updated successfully!" });
  });
});
//Olampiad students

// Get All Students
app.get("/api/students", (req, res) => {
  db.query("SELECT * FROM olympiad_students", (err, results) => {
    if (err) {
      res.status(500).json({ error: "Database query failed" });
    } else {
      res.json(results);
    }
  });
});

// Add New Student
app.post("/api/students", upload.single("image"), (req, res) => {
  const { name, rank } = req.body;
  const imageUrl = req.file ? `/uploads/${req.file.filename}` : "";

  if (!name || !rank || !imageUrl) {
    return res.status(400).json({ error: "All fields are required" });
  }

  db.query(
    "INSERT INTO olympiad_students (name, rank, image) VALUES (?, ?, ?)",
    [name, rank, imageUrl],
    (err, result) => {
      if (err) {
        res.status(500).json({ error: "Database insertion failed" });
      } else {
        res.status(201).json({ id: result.insertId, name, rank, image: imageUrl });
      }
    }
  );
});

// Update Student
app.put("/api/students/:id", upload.single("image"), (req, res) => {
  const { name, rank } = req.body;
  const imageUrl = req.file ? `/uploads/${req.file.filename}` : req.body.image;
  const { id } = req.params;

  db.query(
    "UPDATE olympiad_students SET name=?, rank=?, image=? WHERE id=?",
    [name, rank, imageUrl, id],
    (err) => {
      if (err) {
        res.status(500).json({ error: "Update failed" });
      } else {
        res.json({ message: "Student updated successfully" });
      }
    }
  );
});

// Delete Student
app.delete("/api/students/:id", (req, res) => {
  const { id } = req.params;

  db.query("DELETE FROM olympiad_students WHERE id=?", [id], (err) => {
    if (err) {
      res.status(500).json({ error: "Delete failed" });
    } else {
      res.json({ message: "Student deleted successfully" });
    }
  });
});
//Olampiad-Courses
// 📌 Get All Courses (Fixed Route Path)
// Add Course API
// ✅ Add Course
app.post("/add-course", upload.single("image"), (req, res) => {
  console.log("Request Body:", req.body);
  console.log("Uploaded File:", req.file);

  const { name, language, grade, start_date, end_date, description, price, weeks, classes, tests } = req.body;
  const image = req.file ? `/uploads/${req.file.filename}` : null;

  const sql = `INSERT INTO olympiad_course 
  (name, language, grade, start_date, end_date, description, price, weeks, classes, tests, image) 
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  const values = [name, language, grade, start_date, end_date, description, price, weeks, classes, tests, image];

  db.query(sql, values, (err, result) => {
    if (err) {
      console.error("❌ Database error:", err);
      return res.status(500).json({ error: "Database error: " + err.message });
    }
    console.log("✅ Data inserted successfully:", result);
    res.status(201).json({ id: result.insertId, ...req.body, image });
  });
});


// ✅ Fetch All Courses
app.get("/courses", (req, res) => {
  db.query("SELECT * FROM olympiad_course", (err, results) => {
    if (err) return res.status(500).json({ error: "Database error: " + err.message });
    res.json(results);
  });
});

// ✅ Update Course
app.put("/update-course/:id", upload.single("image"), (req, res) => {
  const { id } = req.params;
  const { name, language, grade, start_date, end_date, description, price, weeks, classes, tests } = req.body;
  const image = req.file ? `/uploads/${req.file.filename}` : req.body.image;

  const sql = `UPDATE olympiad_course 
  SET name=?, language=?, grade=?, start_date=?, end_date=?, description=?, price=?, weeks=?, classes=?, tests=?, image=? 
  WHERE id=?`;

  const values = [name, language, grade, start_date, end_date, description, price, weeks, classes, tests, image, id];

  db.query(sql, values, (err) => {
    if (err) return res.status(500).json({ error: "Database error: " + err.message });
    res.json({ message: "Course updated successfully!" });
  });
});



//Olampiad oferr course
// Get all courses
app.get('/olympiad/courses', (req, res) => {
  db.query('SELECT * FROM olympiad_courses', (err, result) => {
      if (err) return res.status(500).send(err);
      res.json(result);
  });
});

// Update a course
app.put('/olympiad/course/:id', (req, res) => {
  const { level, grade, date, price, oldPrice } = req.body;
  const { id } = req.params;

  const updateQuery = `UPDATE olympiad_courses SET level = ?, grade = ?, date = ?, price = ?, oldPrice = ? WHERE id = ?`;
  const values = [level, grade, date, price, oldPrice, id];

  db.query(updateQuery, values, (err) => {
      if (err) return res.status(500).send(err);
      res.json({ message: 'Course updated successfully' });
  });
});
//Olampiad testinomail
// Get all testimonials
app.get('/testimonials', (req, res) => {
  db.query('SELECT * FROM testimonials', (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(results);
  });
});

// Add a new testimonial
app.post('/testimonials', (req, res) => {
  const { name, role, text, rating } = req.body;
  const sql = 'INSERT INTO testimonials (name, role, text, rating) VALUES (?, ?, ?, ?)';
  db.query(sql, [name, role, text, rating], (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: result.insertId, name, role, text, rating });
  });
});

// Update a testimonial
app.put('/testimonials/:id', (req, res) => {
  const { id } = req.params;
  const { name, role, text, rating } = req.body;
  const sql = 'UPDATE testimonials SET name = ?, role = ?, text = ?, rating = ? WHERE id = ?';
  db.query(sql, [name, role, text, rating, id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Testimonial updated successfully' });
  });
});

// Delete a testimonial
app.delete('/testimonials/:id', (req, res) => {
  const { id } = req.params;
  db.query('DELETE FROM testimonials WHERE id = ?', [id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Testimonial deleted successfully' });
  });
});
//JEE Time TAble
// Fetch Timetable
app.get('/api/timetable', (req, res) => {
  const query = 'SELECT * FROM timetable';
  db.query(query, (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(results);
  });
});

// Update Timetable
app.put('/api/timetable/:day', (req, res) => {
  const { day } = req.params;
  const { class1, class2 } = req.body;
  const query = 'UPDATE timetable SET class1 = ?, class2 = ? WHERE day = ?';

  db.query(query, [class1, class2, day], (err, result) => {
    if (err) return res.status(500).json({ error: 'Failed to update timetable' });
    res.json({ message: 'Timetable updated successfully' });
  });
});

// Initialize Timetable Table
app.post('/api/timetable/init', (req, res) => {
  const defaultTimetable = [
    ['MON', 'Self revision', 'Self revision'],
    ['TUE', 'Physics (5:30 - 7:00 pm)', 'Chemistry (7:10 - 8:40 pm)'],
    ['WED', 'Mathematics (5:30 - 7:00 pm)', 'Chemistry (7:10 - 8:40 pm)'],
    ['THU', 'Physics (5:30 - 7:00 pm)', 'Chemistry (7:10 - 8:40 pm)'],
    ['FRI', 'Chemistry (5:30 - 7:00 pm)', 'Physics (7:10 - 8:40 pm)'],
    ['SAT', 'Self revision', 'Self revision'],
    ['SUN', 'Self revision', 'Self revision']
  ];

  const query = 'INSERT INTO timetable (day, class1, class2) VALUES ?';
  db.query(query, [defaultTimetable], (err) => {
    if (err) return res.status(500).json({ error: 'Failed to initialize timetable' });
    res.json({ message: 'Timetable initialized successfully' });
  });
});
//Olampiad course
// Get all olympiad courses
app.get("/olympiad/courses", (req, res) => {
  db.query("SELECT * FROM uniquer_olympiad_courses", (err, results) => {
    if (err) return res.status(500).json({ error: "Database error" });
    res.json(results);
  });
});

// Add new olympiad course
app.post("/olympiad/add-course", upload.single("image"), (req, res) => {
  const { name, language, grade, start_date, end_date, description, price, weeks, classes, tests } = req.body;
  const image = req.file ? `/uploads/${req.file.filename}` : null;

  const query = `INSERT INTO uniquer_olympiad_courses (name, language, grade, start_date, end_date, description, price, weeks, classes, tests, image)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  db.query(query, [name, language, grade, start_date, end_date, description, price, weeks, classes, tests, image], (err, result) => {
    if (err) return res.status(500).json({ error: "Database error" });
    res.status(201).json({ id: result.insertId, ...req.body, image });
  });
});

// Update olympiad course
app.put("/olympiad/update-course/:id", upload.single("image"), (req, res) => {
  const { name, language, grade, start_date, end_date, description, price, weeks, classes, tests } = req.body;
  const image = req.file ? `/uploads/${req.file.filename}` : null;

  const query = `UPDATE uniquer_olympiad_courses SET 
    name=?, language=?, grade=?, start_date=?, end_date=?, description=?, price=?, weeks=?, classes=?, tests=?
    ${image ? ", image=?" : ""} WHERE id=?`;

  const params = [name, language, grade, start_date, end_date, description, price, weeks, classes, tests];
  if (image) params.push(image);
  params.push(req.params.id);

  db.query(query, params, (err, result) => {
    if (err) return res.status(500).json({ error: "Database error" });
    res.json({ message: "Olympiad course updated successfully" });
  });
});

//StudyMaterial
// Upload PDF Endpoint
// Backend: Node.js + Express API
app.post('/study-material-upload', upload.single('file'), (req, res) => {
  const { title } = req.body;
  const filePath = req.file ? `/uploads/${req.file.filename}` : null;

  if (!title || !filePath) {
      return res.status(400).json({ message: 'Title and PDF file are required.' });
  }

  const sql = 'INSERT INTO study_resources (title, file_path) VALUES (?, ?)';
  db.query(sql, [title, filePath], (err, result) => {
      if (err) {
          console.error(err);
          return res.status(500).json({ message: 'Failed to upload PDF.' });
      }
      res.status(200).json({ 
          message: 'PDF uploaded successfully!',
          file_path: filePath
      });
  });
});

app.get('/study-materials', (req, res) => {
  const sql = 'SELECT * FROM study_resources ORDER BY uploaded_at DESC';
  db.query(sql, (err, results) => {
      if (err) {
          console.error(err);
          return res.status(500).json({ message: 'Failed to fetch PDFs.' });
      }
      res.status(200).json(results);
  });
});

// Delete PDF Endpoint
app.delete('/study-material/:id', (req, res) => {
  const { id } = req.params;
  const sql = 'DELETE FROM study_resources WHERE id = ?';
  db.query(sql, [id], (err, result) => {
      if (err) {
          console.error(err);
          return res.status(500).json({ message: 'Failed to delete PDF.' });
      }
      res.status(200).json({ message: 'PDF deleted successfully.' });
  });
});
//Blog-upatye
// Route to upload a blog banner
// 📌 Get the Latest Banner
// API to upload and store blog banner
// API Route to upload a banner image
app.post('/api/blog/upload-banner', upload.single('bannerImage'), (req, res) => {
  if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
  }
  
  const imageUrl = `http://localhost:${PORT}/uploads/${req.file.filename}`;
  
  db.query('INSERT INTO blog_banners (imageUrl) VALUES (?)', [imageUrl], (err, result) => {
      if (err) {
          return res.status(500).json({ message: 'Database error', error: err });
      }
      res.json({ message: 'Banner uploaded successfully', imageUrl });
  });
});
// API Route to get all banner images
app.get('/api/blog/banners', (req, res) => {
  db.query('SELECT * FROM blog_banners', (err, results) => {
      if (err) {
          return res.status(500).json({ message: 'Database error', error: err });
      }
      res.json(results);
  });
})
// API Route to delete a banner image
app.delete('/api/blog/delete-banner/:id', (req, res) => {
  const bannerId = req.params.id;
  
  db.query('SELECT imageUrl FROM blog_banners WHERE id = ?', [bannerId], (err, results) => {
      if (err || results.length === 0) {
          return res.status(404).json({ message: 'Banner not found' });
      }
      
      const imageUrl = results[0].imageUrl;
      const filePath = path.join(__dirname, 'uploads', path.basename(imageUrl));
      
      fs.unlink(filePath, (err) => {
          if (err) {
              console.error('Error deleting file:', err);
          }
      });
      
      db.query('DELETE FROM blog_banners WHERE id = ?', [bannerId], (err) => {
          if (err) {
              return res.status(500).json({ message: 'Error deleting from database' });
          }
          res.json({ message: 'Banner deleted successfully' });
      });
  });
});

//Blog
// Upload Blog
app.post('/api/blogs', upload.single('image'), (req, res) => {
  const { description } = req.body;
  const imagePath = req.file ? `/uploads/${req.file.filename}` : null;

  const sql = 'INSERT INTO blogs (image, description) VALUES (?, ?)';
  db.query(sql, [imagePath, description], (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ message: 'Blog uploaded successfully', blogId: result.insertId });
  });
});

// Fetch Blogs
app.get('/api/blogs', (req, res) => {
  db.query('SELECT * FROM blogs', (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(results);
  });
});

// Delete Blog
app.delete('/api/blogs/:id', (req, res) => {
  const { id } = req.params;
  db.query('SELECT * FROM blogs WHERE id = ?', [id], (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      if (results.length === 0) return res.status(404).json({ error: 'Blog not found' });

      const imagePath = results[0].image;
      if (imagePath) fs.unlinkSync(`.${imagePath}`);

      db.query('DELETE FROM blogs WHERE id = ?', [id], (err) => {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ message: 'Blog deleted successfully' });
      });
  });
});

//Teacher profile
// Save Profile API
app.post("/api/profile", upload.single("photo"), (req, res) => {
  const { name, post, education, experience } = req.body;
  const photo = req.file ? `/uploads/${req.file.filename}` : null;

  const sql =
    "INSERT INTO profiles (name, post, education, experience, photo) VALUES (?, ?, ?, ?, ?)";
  db.query(sql, [name, post, education, experience, photo], (err, result) => {
    if (err) {
      return res.status(500).json({ error: "Failed to save profile" });
    }
    res.json({ message: "Profile saved successfully", id: result.insertId });
  });
});

// Get Profiles API
app.get("/api/profile", (req, res) => {
  db.query("SELECT * FROM profiles", (err, results) => {
    if (err) {
      return res.status(500).json({ error: "Failed to fetch profiles" });
    }
    res.json(results);
  });
});

// Delete Profile API
app.delete("/api/profile/:id", (req, res) => {
  const { id } = req.params;
  const sql = "DELETE FROM profiles WHERE id = ?";
  db.query(sql, [id], (err) => {
    if (err) {
      return res.status(500).json({ error: "Failed to delete profile" });
    }
    res.json({ message: "Profile deleted successfully" });
  });
});

//Testinomial-update
// Add Testimonial
app.post('/api/testimonials', (req, res) => {
  const { youtubeLink, candidateName, ranking, year, description } = req.body;
  const query = 'INSERT INTO cavalier_front_testimonials (youtubeLink, candidateName, ranking, year, description) VALUES (?, ?, ?, ?, ?)';
  db.query(query, [youtubeLink, candidateName, ranking, year, description], (err) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.status(201).json({ message: 'Testimonial added successfully' });
  });
});

// Get All Testimonials
app.get('/api/testimonials', (req, res) => {
  const query = 'SELECT * FROM cavalier_front_testimonials';
  db.query(query, (err, results) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.status(200).json(results);
  });
});

// Delete Testimonial
app.delete('/api/testimonials/:id', (req, res) => {
  const { id } = req.params;
  const query = 'DELETE FROM cavalier_front_testimonials WHERE id = ?';
  db.query(query, [id], (err) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.status(200).json({ message: 'Testimonial deleted successfully' });
  });
});

//jee banner update
// 🚀 API: Fetch All JeeBanners
app.get("/api/jeebanners", (req, res) => {
  db.query("SELECT * FROM jeebanner", (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// 🚀 API: Upload New JeeBanner
app.post("/api/jeebanner", upload.single("image"), (req, res) => {
  const { text } = req.body;
  const imageUrl = "/uploads/" + req.file.filename;

  if (!text || !req.file) {
    return res.status(400).json({ error: "Text and image are required" });
  }

  db.query("INSERT INTO jeebanner (text, image_url) VALUES (?, ?)", [text, imageUrl], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: "JeeBanner added successfully!", banner: { id: result.insertId, text, imageUrl } });
  });
});

// 🚀 API: Delete a JeeBanner
app.delete("/api/jeebanner/:id", (req, res) => {
  const { id } = req.params;

  db.query("DELETE FROM jeebanner WHERE id = ?", [id], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: "JeeBanner deleted successfully!" });
  });
});


// ✅ Start Server
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
