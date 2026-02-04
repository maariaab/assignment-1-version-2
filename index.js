require("./utils.js");
require("dotenv").config();

const express = require("express");
const session = require("express-session");
const connectMongo = require("connect-mongo");
const MongoStore = connectMongo.MongoStore || connectMongo.default || connectMongo;
//const MongoStore = require("connect-mongo").MongoStore; 

const Joi = require("joi");
const bcrypt = require("bcrypt");
const saltRounds = 12;

const db_utils = include("database/db_utils");
const db_setup = include("database/create_tables");
const db_users = include("database/users");
db_utils.printMySQLVersion();

const app = express();
const port = process.env.PORT || 3000;

/** Middleware */
app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: false }));
app.use(express.static("public"));

const expireTime = 1 * 60 * 60 * 1000; // 1 hour

/* secrets */
const mongodb_host = process.env.MONGODB_HOST;
const mongodb_user = process.env.MONGODB_USER;
const mongodb_password = process.env.MONGODB_PASSWORD;
const mongodb_database = process.env.MONGODB_DATABASE;
const mongodb_session_secret = process.env.MONGODB_SESSION_SECRET;
const node_session_secret = process.env.NODE_SESSION_SECRET;
/* end secrets */

const mongoStore = MongoStore.create({
  mongoUrl: `mongodb+srv://${mongodb_user}:${mongodb_password}@${mongodb_host}/${mongodb_database}?retryWrites=true&w=majority`,
  collectionName: "sessions",
  ttl: expireTime / 1000, // seconds
  crypto: { secret: mongodb_session_secret },
});

app.use(
  session({
    secret: node_session_secret,
    store: mongoStore,
    saveUninitialized: false,
    resave: false,
    cookie: {
      maxAge: expireTime,
      httpOnly: true,
      sameSite: "lax",
    },
  })
);


// ---- ROUTES ----

app.get("/", (req, res) => {
  if (req.session?.authenticated) {
    res.send(`
      <h2>Welcome back, ${req.session.username ?? "user"}!</h2>
      <button><a href="/members" style="text-decoration:none;color:inherit;">Go to members</a></button>
      <button><a href="/logout" style="text-decoration:none;color:inherit;">Log Out</a></button>
    `);
    return;
  }

  res.send(`
    <h1>Welcome to the Landing Page!</h1>
    <button><a href="/signup" style="text-decoration:none;color:inherit;">Sign Up</a></button>
    <button><a href="/login" style="text-decoration:none;color:inherit;">Log In</a></button>
  `);
});

app.get("/signup", (req, res) => {
  const error = req.query.error ? `<p style="color:black;">${req.query.error}</p>` : "";
  res.send(`
    <h2>Create Account</h2>
    <form action="/submitUser" method="post">
      <input name="username" type="text" placeholder="username"><br>
      <input name="password" type="password" placeholder="password"><br>
      <button>Submit</button>
    </form>
    ${error}
  `);
});

app.post("/submitUser", async (req, res) => {
  if (!req.session) {
    res.status(500).send("Session middleware not initialized.");
    return;
  }

  const { username, password } = req.body;

  const schema = Joi.object({
    username: Joi.string().trim().min(1).max(30).required().messages({
      "string.empty": "Username is required",
      "any.required": "Username is required",
    }),
    password: Joi.string().alphanum().trim().min(1).max(72).required().messages({
      "string.empty": "Password is required",
      "any.required": "Password is required",
    }),
  });

  const { error } = schema.validate({ username, password }, { abortEarly: false });

  if (error) {
    const message = error.details.map((d) => d.message).join(", ");
    res.redirect(`/signup?error=${encodeURIComponent(message)}`);
    return;
  }

  const hashedPassword = await bcrypt.hash(password, saltRounds);

  const ok = await db_users.createUser({
    user: username,
    hashedPassword,
  });

  if (!ok) {
    res.redirect("/signup?error=Unable to create user (username may already exist)");
    return;
  }

  req.session.username = username;
  req.session.authenticated = true;
  res.redirect("/members");
});

app.get("/login", (req, res) => {
  const errorMessage = req.query.error ? `<p style="color:black;">${req.query.error}</p>` : "";
  res.send(`
    <h2>Log in</h2>
    <form action="/loggingin" method="post">
      <input name="username" type="text" placeholder="username"><br>
      <input name="password" type="password" placeholder="password"><br>
      <button>Submit</button>
    </form>
    ${errorMessage}
  `);
});

app.post("/loggingin", async (req, res) => {
  if (!req.session) {
    res.status(500).send("Session middleware not initialized.");
    return;
  }

  const { username, password } = req.body;

  const schema = Joi.object({
    username: Joi.string().trim().min(1).max(50).required(),
    password: Joi.string().trim().min(1).max(72).required(),
  });

  const { error } = schema.validate({ username, password }, { abortEarly: false });

  if (error) {
    res.redirect("/login?error=Username and password not found");
    return;
  }

  const rows = await db_users.getUserByUsername({ user: username });

  if (!rows || rows.length !== 1) {
    res.redirect("/login?error=Username and password not found");
    return;
  }

  const user = rows[0];

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) {
    res.redirect("/login?error=Username and password not found");
    return;
  }

  req.session.authenticated = true;
  req.session.username = user.username;
  req.session.cookie.maxAge = expireTime;

  res.redirect("/members");
});

app.get("/members", (req, res) => {
  if (!req.session?.authenticated) {
    res.redirect("/");
    return;
  }

  const selector = Math.floor(Math.random() * 2);
  const img = selector === 0 ? "smart-cat.jpg" : "angry-cat.jpg";

  res.send(`
    Hello, ${req.session.username}!<br>
    <img src="/${img}" style="width:250px;"><br><br>
    <button><a href="/logout" style="text-decoration: none; color: inherit;">Log out</a></button>
  `);
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
});

app.get("/about", (req, res) => {
  const color = req.query.color;
  res.send(`<h1 style="color:${color};">Patrick Guichon</h1>`);
});

app.get("*", (req, res) => {
  res.status(404).send("Page not found - 404");
});


async function startServer() {
  db_utils.printMySQLVersion();

  const ok = await db_setup.createTables();
  if (!ok) {
    console.log("Table creation failed. Server not started.");
    process.exit(1);
  }

  app.listen(port, () => {
    console.log(`Node application listening on port ${port}`);
  });
}

startServer().catch((err) => console.error("Failed to start server:", err));
