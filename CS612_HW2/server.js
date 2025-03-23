const express = require('express');
const { Pool } = require('pg');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const path = require('path');

const app = express();
app.use(express.json());

const swaggerDocument = YAML.load(path.join(__dirname, 'swagger.yaml'));

// Setup Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

const pool = new Pool({
  user: 'myuser', 
  host: '3.144.253.157', 
  database: 'cs612_hw1', 
  password: 'mypassword', 
  port: 5432, 
  ssl: false,
});

pool.connect()
  .then(() => console.log("Connected to PostgreSQL successfully"))
  .catch(err => {
    console.error("Connection error", err);
    process.exit(1);
  });

/* -------------------- Airlines Endpoints -------------------- */

app.get('/airlines/country/:country', async (req, res) => {
  try {
    const { country } = req.params;
    const result = await pool.query("SELECT * FROM airlines WHERE country = $1", [country]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Server Error" });
  }
});

app.get('/airlines/:iata/:icao', async (req, res) => {
  try {
    const { iata, icao } = req.params;
    
    const result = await pool.query(
      "SELECT * FROM airlines WHERE iata = $1 AND icao = $2", 
      [iata, icao]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "No airline found with the given IATA and ICAO codes." });
    }

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Server Error" });
  }
});


app.post('/airlines', async (req, res) => {
  try {
    const { name, iata, icao, callsign, country } = req.body;
    const result = await pool.query(
      "INSERT INTO airlines (name, iata, icao, callsign, country) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [name, iata || null, icao || null, callsign, country]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Server Error" });
  }
});

app.delete('/airlines/:iata/:icao', async (req, res) => {
  try {
    const { iata, icao } = req.params;

    const result = await pool.query(
      "DELETE FROM airlines WHERE iata = $1 AND icao = $2 RETURNING *", 
      [iata, icao]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Airline not found with the given IATA and ICAO codes." });
    }

    res.json({ message: "Airline deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Server Error" });
  }
});


/* -------------------- Airports Endpoints -------------------- */

app.get('/airports/country/:country', async (req, res) => {
  try {
    const { country } = req.params;
    const result = await pool.query("SELECT * FROM airports WHERE country = $1", [country]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Server Error" });
  }
});

app.get('/airports/:iata/:icao', async (req, res) => {
  try {
    const { iata, icao } = req.params;
    
    const result = await pool.query(
      "SELECT * FROM airports WHERE iata = $1 AND icao = $2", 
      [iata, icao]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "No airport found with the given IATA and ICAO codes." });
    }

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Server Error" });
  }
});


app.post('/airports', async (req, res) => {
  try {
    const { name, city, country, iata, icao, latitude, longitude } = req.body;
    const result = await pool.query(
      "INSERT INTO airports (name, city, country, iata, icao, latitude, longitude) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *",
      [name, city, country, iata || null, icao || null, latitude, longitude]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Server Error" });
  }
});

app.delete('/airports/:iata/:icao', async (req, res) => {
  try {
    const { iata, icao } = req.params;

    const result = await pool.query(
      "DELETE FROM airports WHERE iata = $1 AND icao = $2 RETURNING *", 
      [iata, icao]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Airport not found with the given IATA and ICAO codes." });
    }

    res.json({ message: "Airport deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Server Error" });
  }
});


/* -------------------- Routes Endpoints -------------------- */

/* -------------------- 1️⃣ Calculate Distance Between Two Airports -------------------- */
app.get('/routes/distance/:from/:to', async (req, res) => {
  try {
    const { from, to } = req.params;

    const result = await pool.query(`
      SELECT a1.latitude AS lat1, a1.longitude AS lon1, 
             a2.latitude AS lat2, a2.longitude AS lon2
      FROM airports a1, airports a2
      WHERE a1.iata = $1 AND a2.iata = $2
    `, [from, to]);

    if (result.rows.length === 0) return res.status(404).json({ error: "Airports not found" });

    const { lat1, lon1, lat2, lon2 } = result.rows[0];

    const R = 6378; // Earth radius in km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    res.json({ distance_km: distance.toFixed(2) });
  } catch (err) {
    res.status(500).json({ error: "Server Error" });
  }
});

/* -------------------- 2️⃣ List Airlines & Aircraft Types for a Route -------------------- */
app.get('/routes/:departure/:arrival', async (req, res) => {
  try {
    const { departure, arrival } = req.params;

    console.log("Fetching routes for:", departure, arrival);

    // Ensure parameters are not empty
    if (!departure || !arrival) {
      return res.status(400).json({ error: "Departure and arrival must be provided" });
    }

    // Query to fetch airlines and aircraft types for the given route
    const result = await pool.query(
      `SELECT airline, planes FROM routes WHERE departure = $1 AND arrival = $2`,
      [departure.toUpperCase(), arrival.toUpperCase()] // Convert to uppercase for consistency
    );

    // If no matching route is found
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "No airlines found for this route." });
    }

    res.status(200).json(result.rows);
  } catch (err) {
    console.error("Error fetching routes:", err);
    res.status(500).json({ error: "Server Error", details: err.message });
  }
});




/* -------------------- 3️⃣ Get Arrival Airports for a Departure Airport -------------------- */
app.get('/routes/arrivals/:from', async (req, res) => {
  try {
    const { from } = req.params;

    const result = await pool.query(`
      SELECT DISTINCT arrival FROM routes WHERE departure = $1
    `, [from]);

    res.json(result.rows.map(row => row.arrival));
  } catch (err) {
    res.status(500).json({ error: "Server Error" });
  }
});

/* -------------------- 4️⃣ List Routes for an Airline & Aircraft Type -------------------- */
app.get('/routes/airline/:airline/planes/:aircraft', async (req, res) => {
  try {
    const { airline, aircraft } = req.params;

    const result = await pool.query(`
      SELECT departure, arrival FROM routes WHERE airline = $1 AND planes LIKE '%' || $2 || '%'
    `, [airline, aircraft]);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Server Error" });
  }
});

/* -------------------- 5️⃣ Add a New Route with Validation -------------------- */
app.post('/routes', async (req, res) => {
  try {
    const { airline, departure, arrival, planes } = req.body;

    // ✅ Validate airline (IATA must be 2 characters and exist in airlines table)
    if (!/^[A-Z0-9]{2}$/.test(airline)) {
      return res.status(400).json({ error: "Invalid airline format. Must be a 2-character IATA code." });
    }
    const airlineExists = await pool.query("SELECT * FROM airlines WHERE iata = $1", [airline]);
    if (airlineExists.rows.length === 0) {
      return res.status(400).json({ error: "Invalid airline. Airline not found in database." });
    }

    // ✅ Validate departure and arrival airports (IATA must be 3 characters and exist in airports table)
    if (!/^[A-Z]{3}$/.test(departure) || !/^[A-Z]{3}$/.test(arrival)) {
      return res.status(400).json({ error: "Invalid airport format. IATA codes must be 3 characters." });
    }
    const depExists = await pool.query("SELECT * FROM airports WHERE iata = $1", [departure]);
    const arrExists = await pool.query("SELECT * FROM airports WHERE iata = $1", [arrival]);
    if (depExists.rows.length === 0 || arrExists.rows.length === 0) {
      return res.status(400).json({ error: "Invalid departure or arrival airport. Airport not found in database." });
    }

    // ✅ Validate aircraft type (3-character code, must exist in airplanes table)
    if (!/^[A-Z0-9]{3}$/.test(planes)) {
      return res.status(400).json({ error: "Invalid aircraft format. Must be a 3-character aircraft code." });
    }
    const aircraftExists = await pool.query("SELECT * FROM planes WHERE code = $1", [planes]);
    if (aircraftExists.rows.length === 0) {
      return res.status(400).json({ error: "Invalid aircraft. Aircraft not found in database." });
    }

    // ✅ Insert new route into the database
    const result = await pool.query(
      `INSERT INTO routes (airline, departure, arrival, planes) VALUES ($1, $2, $3, $4) RETURNING *`,
      [airline, departure, arrival, planes]
    );

    res.status(201).json({ message: "Route added successfully", route: result.rows[0] });
  } catch (err) {
    console.error("Error inserting route:", err);
    res.status(500).json({ error: "Server Error", details: err.message });
  }
});



/* -------------------- 6️⃣ Delete a Route -------------------- */
app.delete('/routes', async (req, res) => {
  try {
    const { airline, departure, arrival } = req.body;

    const result = await pool.query(`
      DELETE FROM routes WHERE airline = $1 AND departure = $2 AND arrival = $3 RETURNING *
    `, [airline, departure, arrival]);

    if (result.rowCount === 0) return res.status(404).json({ error: "Route not found" });

    res.json({ message: "Route deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Server Error" });
  }
});

/* -------------------- 7️⃣ Update a Route by Adding a New Aircraft Type -------------------- */
app.put('/routes', async (req, res) => {
  try {
    const { airline, departure, arrival, newAircraft } = req.body;

    // Validate input
    if (!airline || !departure || !arrival || !newAircraft) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Fetch existing aircraft list
    const route = await pool.query(
      `SELECT planes FROM routes WHERE airline = $1 AND departure = $2 AND arrival = $3`,
      [airline, departure, arrival]
    );

    if (route.rows.length === 0) {
      return res.status(404).json({ error: "Route not found" });
    }

    let aircraftList = route.rows[0].planes ? route.rows[0].planes.split(' ') : [];

    if (!aircraftList.includes(newAircraft)) {
      aircraftList.push(newAircraft);
      aircraftList.sort(); 
      await pool.query(
        `UPDATE routes SET planes = $1 WHERE airline = $2 AND departure = $3 AND arrival = $4`,
        [aircraftList.join(' '), airline, departure, arrival]
      );
    }

    res.json({ message: "Aircraft type updated successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server Error" });
  }
});

/* -------------------- Start Server -------------------- */
const PORT = 8001;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});