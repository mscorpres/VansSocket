const fs = require("fs");

const jwt = require("jsonwebtoken");
const { vansOtherDB, vansDB } = require("./../../config/db/connection");

exports.page_status = function (io, socket) {
	// Set Page status
	socket.on("setPageStatus", async (data) => {
		// console.log( "headers", socket.handshake.auth.token);
		try {
			let check = await verifyToken(`${socket.handshake.auth.token}`);
			console.log("check", check.crn_id);
			let setData = {
				page: data.page,
				status: data.status,
			};

			if (check.crn_id) {
				let result = await vansDB.query("SELECT * FROM `admin_login` WHERE `CustID` = :data AND type = 'developer'", {
					replacements: { data: check.crn_id },
					type: vansDB.QueryTypes.SELECT,
				});
				if (result.length === 0) {
					return socket.emit(`${setData.page}`, (data = { message: "User not found", code: 404, user: "Not Developer" }));
				} else {
					// read the json file
					fs.readFile("./helper/pageStatus.json", "utf8", (err, data) => {
						if (err) throw err;
						let json = JSON.parse(data);
						json[setData.page] = setData.status;
						fs.writeFile("./helper/pageStatus.json", JSON.stringify(json), (err) => {
							if (err) throw err;
							// read the json file
							fs.readFile("./helper/pageStatus.json", "utf8", (err, data) => {
								if (err) throw err;
								let json = JSON.parse(data)

								socket.broadcast.emit("getPageStatus", json);
								socket.emit(`${setData.page}`, (data = { message: `YOU'RE IN ${json[setData.page]} MODE`, code: 200, user: "Developer" }));
							});
						});
					});
				}
			}
		} catch (err) {
			console.log(" token ", err);
		}
	});

	// GET PAGE STATUS
	socket.on("getPageStatus", async (data) => {
		try {
			// let check = await verifyToken(`${socket.handshake.auth.token}`);
			// console.log("check", check.crn_id);

			// let result = await vansDB.query("SELECT CustID,type FROM `admin_login` WHERE `CustID` = :data", {
			//   replacements: { data: check.crn_id },
			//   type: vansDB.QueryTypes.SELECT,
			// });

			// read the json file
			fs.readFile("./helper/pageStatus.json", "utf8", (err, jsondata) => {
				if (err) throw err;
				let json = JSON.parse(jsondata);
				// console.log(json);
				// console.log("after read ", json[data.page]);

				if (json[data.page] == "LIVE") {
					// socket.emit(`${data.page}`, (data = { message: `YOU'RE IN ${json[data.page]} MODE`, code: 200, user: { type: result[0].type } }));
					socket.emit(`${data.page}`, (data = { message: `YOU'RE IN ${json[data.page]} MODE`, code: 200 }));
				}
				if (json[data.page] == "TEST") {
					// socket.emit(`${data.page}`, (data = { message: `YOU'RE IN ${json[data.page]} MODE`, code: 500, user: { type: result[0].type } }));
					socket.emit(`${data.page}`, (data = { message: `YOU'RE IN ${json[data.page]} MODE`, code: 500 }));
				}
			});

			verifyToken(`${socket.handshake.auth.token}`)
				.then((token) => { })
				.catch((err) => {
					socket.emit("logout", { msg: "Token Expired", err: err, token: socket.handshake.auth.token });
				});
		} catch (err) {
			console.log("socket error", err);
		}
	});

	// GET SERVER STATUS
	socket.on("getServerStatus", async (data) => {
		try {
			token_res = await verifyToken(`${socket.handshake.auth.token}`);
			let company_id = token_res.company_id;
			let user_id = token_res.crn_id;

			let stmt = await vansOtherDB.query(`SELECT * FROM ${global.vans_db_ims}.admin_login invt LEFT JOIN ${global.vans_db_other}.ims_company other ON invt.company_id = other.company_id WHERE invt.CustID = :user_id`, {
				replacements: { company_id: company_id, user_id: user_id },
				type: vansOtherDB.QueryTypes.SELECT,
			});
			if (stmt.length > 0) {
				if (stmt[0].company_server !== "ON" && stmt[0].type !== "developer") {
					// ERROR WILL SHOW TO ALL ACCOUNT EXCEPT DEVELOPER ACCOUNT
					socket.emit("server_status", { code: "500", error: "body" });
				} else if (stmt[0].company_server !== "ON" && stmt[0].type == "developer") {
					// ERROR WILL SHOW TO DEVELOPER ACCOUNT EXCEPT OTHER ACCOUNT
					socket.emit("server_status", { code: "500", error: "top" });
				}
			}
		} catch (err) {
			console.warn("Socket Server Error: ", err);
		}
	});

	function verifyToken(token) {
		return new Promise((resolve, reject) => {
			jwt.verify(token, process.env.TOKEN_SECRET, (err, decoded) => {
				if (err) {
					reject(err);
				} else {
					resolve(decoded);
				}
			});
		});
	}
};
