const { mysqlPool: database } = include('databaseConnection');

async function createUser(postData) {
	let createUserSQL = `
		INSERT INTO users (username, password)
		VALUES (:user, :passwordHash);
	`;

	let params = {
		user: postData.user,
		passwordHash: postData.hashedPassword
	}
	
	try {
		const results = await database.query(createUserSQL, params);

        console.log("Successfully created user");
		console.log(results[0]);
		return true;
	}
	catch(err) {
		console.log("Error inserting user");
        console.log(err);
		return false;
	}
}

function escapeHTML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function getUserByUsername(postData) {
  const sql = `
    SELECT user_id, username, password
    FROM users
    WHERE username = :user
    LIMIT 1;
  `;

  const params = { user: postData.user };

  try {
    const [rows] = await database.query(sql, params);
    if (rows.length > 0) {
 
      rows[0].username = escapeHTML(rows[0].username);
    }
    return rows; 
  } catch (err) {
    console.log("Error finding user by username");
    console.log(err);
    return false;
  }
}

module.exports = {createUser, getUserByUsername};