const jwt = require("jsonwebtoken");
const fs = require("fs");

const { vansOtherDB, vansDB } = require("../config/db/connection");

const error_log = function ({ stack }) {
  try {
    fs.appendFile("./logs/error.log", `${stack}\n`, function (err) {
      if (err) {
        console.log(err);
      }
    });
  } catch (err) {
    // console.log(err);
  }
};

const verifyToken = async function (token) {
  return new Promise((resolve, reject) => {
    jwt.verify(token, process.env.TOKEN_SECRET, (err, decoded) => {
      if (err) {
        reject(err);
      } else {
        resolve(decoded);
      }
    });
  });
};

const emit_notifications = async function (io, socket, notificationId) {
  try {
    token_res = await verifyToken(`${socket.handshake.auth.token}`);
    let user_id = token_res.crn_id;
    let stmt = await vansOtherDB.query("SELECT * FROM user_files_req WHERE user_id = :uid ORDER BY ID DESC", {
      replacements: { uid: user_id },
      type: vansOtherDB.QueryTypes.SELECT,
    });
    if (stmt.length > 0) {
      if (notificationId) {
        let item = { ...stmt[0], notificationId: notificationId };
        stmt.unshift();
        stmt = [item, ...stmt];
        io.to(user_id).emit("socket_receive_notification", stmt);
      } else {
        socket.emit("notification", stmt);
      }
    }
  } catch (err) {
    error_log({ stack: err.stack });
  }
};

const emit_error_msg = async function (io, socket, msg) {
  try {
    const { crn_id } = await verifyToken(`${socket.handshake.auth.token}`);
    io.to(crn_id).emit("error_msg", msg);
  } catch (err) {
    error_log({ stack: err.stack });
  }
};

const download_start_detail = async function (io, socket, title, status, req) {
  try {
    const { crn_id } = await verifyToken(`${socket.handshake.auth.token}`);
    io.to(crn_id).emit("download_start_detail", {
      title: title,
      details: req.groupKey,
      notificationId: req.notificationId,
      status: status,
      detailStatus: true,
      type: "file",
    });
  } catch (error) {
    error_log({ stack: error.stack });
  }
};



module.exports = {
  verifyToken,
  emit_notifications,
  error_log,
  emit_error_msg,
  download_start_detail,
  
};
