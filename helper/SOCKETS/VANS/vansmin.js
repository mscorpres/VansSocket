const { vansOtherDB, vansDB  } = require("./../../../config/db/connection");
const jwt = require("jsonwebtoken");
const xlsx = require("xlsx");
const { decode } = require("html-entities");

const moment = require("moment")

exports.filegenerate = async function (io, socket) {
  try {
    socket.on("min_filegenerate", async (data) => {
      token_res = await verifyToken(`${socket.handshake.auth.token}`);

      user_id = token_res.crn_id;
      let alldata = [];
      socket.join(user_id);
      const searchValue = data.date;

      if (!/([0-9]{2})-([0-9]{2})-([0-9]{4})/gi.test(searchValue)) {
        socket.emit("toastr_error", {
          msg: "invalid date format ",
        });
        return;
      }

      const date = searchValue.match(/([0-9]{2})-([0-9]{2})-([0-9]{4})/g);

      let date1 = moment(date[0], "DD-MM-YYYY").format("YYYY-MM-DD");
      let date2 = moment(date[1], "DD-MM-YYYY").format("YYYY-MM-DD");

      if (moment(date[1], "DD-MM-YYYY").diff(moment(date[0], "DD-MM-YYYY"), "days") > "90") {
        socket.emit("toastr_error", {
          msg: "on the w.e.f Nov 11, 2021: We can provide you 90 days OR (3 months) data only",
        });
        return;
      }

      let fileName = "";
      let finalResult = [];
      if (data.type === "MARKUP") {

        // INIT AND CHECK
        let check_data = await vansOtherDB.query("SELECT * FROM `user_files_req` WHERE `user_id`= :uid AND `req_code` = 'MARKUP' AND `status` = 'pending'", {
          replacements: {
            uid: user_id,
          },
          type: vansOtherDB.QueryTypes.SELECT,
        });

        if (check_data.length > 0) {
          fileName = JSON.parse(check_data[0].other_data).url;
        } else {
          fileName = "files/excel/MARKMIN" + (Math.floor(Math.random() * (999 - 100 + 1)) + 100) + ".xlsx";

          let stmt_insert = await vansOtherDB.query("INSERT INTO `user_files_req` ( module_name , request_txt_label , req_code , 	user_id , msg_type , 	status , insert_date , other_data ) VALUES ( :module_name , :request_txt_label , :req_code , :user_id , :msg_type , :status , :insert_date, :other_data ) ", {
            replacements: {
              module_name: "INVT",
              request_txt_label: "MARKUP MIN Report",
              req_code: "MARKUP",
              user_id: user_id,
              msg_type: "file",
              status: "pending",
              insert_date: moment(new Date()).format("YYYY-MM-DD HH:mm:ss"),
              other_data: JSON.stringify({
                fileName: "MARKUP_MIN",
                fileUrl: fileName,
              }),
            },
            type: vansOtherDB.QueryTypes.INSERT,
          });
        }
        // END

        let result = await vansDB.query(
          "SELECT *, `rm_location`.`insert_date` FROM `rm_location` LEFT JOIN `components` ON rm_location.components_id = components.component_key LEFT JOIN units ON components.c_uom = units.units_id LEFT JOIN admin_login ON rm_location.insert_by = admin_login.CustID WHERE `components`.`c_type` = 'R' AND DATE_FORMAT(rm_location.insert_date,'%Y-%m-%d') BETWEEN :date1 AND :date2 AND `rm_location`.trans_type = 'INWARD' ORDER BY rm_location.insert_date DESC",
          {
            replacements: { date1: date1, date2: date2 },
            type: vansDB.QueryTypes.SELECT,
          }
        );
        if (result.length > 0) {
          for (let i = 0; i < result.length; i++) {
            let vendor = "";
            if (result[i].vendor_type == "v01") {
              vendor = "Vendor";
            } else if (result[i].vendor_type == "j01") {
              vendor = "JWI";
            } else if (result[i].vendor_type == "s01") {
              vendor = "SortIn";
            } else if (result[i].vendor_type == "r01") {
              vendor = "RejIn";
            } else if (result[i].vendor_type == "p01") {
              vendor = "ProdReturn";
            } else {
              vendor = "N/A";
            }
            let vendorName;
            if (result[i].in_vendor_name != "--") {
              let stmt_vendorName = await vansDB.query("SELECT `ven_name`,`ven_register_id` FROM `ven_basic_detail` WHERE `ven_register_id` = :vendor", {
                replacements: { vendor: result[i].in_vendor_name },
                type: vansDB.QueryTypes.SELECT,
              });
              if (stmt_vendorName.length > 0) {
                vendorName = stmt_vendorName[0].ven_name;
                vendorCode = stmt_vendorName[0].ven_register_id;
              } else {
                vendorName = "N/A";
                vendorCode = "N/A";
              }
            } else {
              vendorName = "N/A";
              vendorCode = "N/A";
            }


            let project_name, invoice_number, po_number;
            if (result[i].in_po_txn_id !== "--") {
              invoice_number = result[i].in_po_txn_id;
              po_number = result[i].in_po_txn_id;

              let stmt_project = await vansDB.query("SELECT `po_project_name` FROM `po_purchase_req` WHERE `po_transaction` = :po", { replacements: { po: po_number }, type: vansDB.QueryTypes.SELECT });
              if (stmt_project.length > 0) {
                project_name = stmt_project[0].po_project_name == "" ? "N/A" : stmt_project[0].po_project_name;
              } else {
                project_name = "N/A";
              }
            } else {
              if (result[i].in_invoice_id !== "--") {
                invoice_number = result[i].in_invoice_id;
                po_number = "N/A";
              } else {
                invoice_number = "N/A";
                po_number = "N/A";
              }
              project_name = "N/A";
            }

            if (result[i].currency_type == "--" || result[i].currency_type == "" || result[i].currency_type == "364907247") {
              currency = "INR";
            } else {
              currency = "USD";
            }

            let inQty = parseInt(result[i].qty) + parseInt(result[i].other_qty);

            let hsncode = "";
            if (result[i].in_hsn_code !== "" && result[i].in_hsn_code !== "--") {
              hsncode = result[i].in_hsn_code;
            } else {
              hsncode = "--";
            }

            finalResult.push({
              DATE: moment(result[i].insert_date, "YYYY-MM-DD HH:mm:ss").format("DD-MM-YYYY HH:mm:ss"),
              COMPONENT: decode(result[i].c_name),
			  DESCRIPTION: decode(result[i].c_specification),
              PART: result[i].c_part_no,
              HSNCODE: hsncode,
              TYPE: vendor,
              LOCATION: result[i].loc_in,
              RATE: result[i].in_rate,
              CURRENCY: currency,
              INQTY: inQty,
              UNIT: result[i].units_name,
              VENDOR_NAME: vendorName,
              VENDOR_CODE: vendorCode,
              PONUMBER: po_number,
              INVOIVENUMBER: invoice_number,
              TRANSACTION: result[i].in_transaction_id,
              ISSUEBY: result[i].user_name,
              COMMENT: result[i].any_remark == "" ? "--" : result[i].any_remark,
              PROJECT: project_name
            });
          }
        } else {
          socket.emit("toastr_error", {
            msg: "no records found for download",
          });
          return;
        }
      }

      if (data.type === "NONMARKUP") {

        // INIT AND CHECK
        let check_data = await vansOtherDB.query("SELECT * FROM `user_files_req` WHERE `user_id`= :uid AND `req_code` = 'NONMARKUP' AND `status` = 'pending'", {
          replacements: {
            uid: user_id,
          },
          type: vansOtherDB.QueryTypes.SELECT,
        });

        if (check_data.length > 0) {
          fileName = JSON.parse(check_data[0].other_data).url;
        } else {
          fileName = "files/excel/NONMARKUP" + (Math.floor(Math.random() * (999 - 100 + 1)) + 100) + ".xlsx";

          let stmt_insert = await vansOtherDB.query("INSERT INTO `user_files_req` ( module_name , request_txt_label , req_code , 	user_id , msg_type , 	status , insert_date , other_data ) VALUES ( :module_name , :request_txt_label , :req_code , :user_id , :msg_type , :status , :insert_date, :other_data ) ", {
            replacements: {
              module_name: "INVT",
              request_txt_label: "NONMARKUP MIN Report",
              req_code: "NONMARKUP",
              user_id: user_id,
              msg_type: "file",
              status: "pending",
              insert_date: moment(new Date()).format("YYYY-MM-DD HH:mm:ss"),
              other_data: JSON.stringify({
                fileName: "NONMARKUP_MIN",
                fileUrl: fileName,
              }),
            },
            type: vansOtherDB.QueryTypes.INSERT,
          });
        }

        console.log("----", fileName)
        // END

        let result = await vansDB.query(
          "SELECT *, `rm_transaction`.`insert_date` FROM `rm_transaction` LEFT JOIN `components` ON rm_transaction.components_id = components.component_key LEFT JOIN units ON components.c_uom = units.units_id LEFT JOIN admin_login ON rm_transaction.insert_by = admin_login.CustID WHERE `components`.`c_type` = 'R' AND DATE_FORMAT(rm_transaction.insert_date,'%Y-%m-%d') BETWEEN :date1 AND :date2 AND `rm_transaction`.trans_type = 'INWARD' AND `rm_transaction`.`qty` != `rm_transaction`.`settle_qty` ORDER BY rm_transaction.insert_date DESC",
          {
            replacements: { date1: date1, date2: date2 },
            type: vansDB.QueryTypes.SELECT,
          }
        );


        if (result.length > 0) {
          for (let i = 0; i < result.length; i++) {
            let vendor = "";
            if (result[i].vendor_type == "v01") {
              vendor = "Vendor";
            } else if (result[i].vendor_type == "j01") {
              vendor = "JWI";
            } else if (result[i].vendor_type == "s01") {
              vendor = "SortIn";
            } else if (result[i].vendor_type == "r01") {
              vendor = "RejIn";
            } else if (result[i].vendor_type == "p01") {
              vendor = "ProdReturn";
            } else {
              vendor = "N/A";
            }
            let vendorName;
            let stmt_vendorName = await vansDB.query("SELECT `ven_name`,`ven_register_id` FROM `ven_basic_detail` WHERE `ven_register_id` = :vendor", {
              replacements: { vendor: result[i].in_vendor_name },
              type: vansDB.QueryTypes.SELECT,
            });
            if (stmt_vendorName.length > 0) {
              vendorName = stmt_vendorName[0].ven_name;
              vendorCode = stmt_vendorName[0].ven_register_id;
            } else {
              vendorName = "N/A";
              vendorCode = "N/A";
            }

            let project_name, invoice_number, po_number;
            if (result[i].in_po_txn_id !== "--") {
              invoice_number = result[i].in_po_txn_id;
              po_number = result[i].in_po_txn_id;

              let stmt_project = await vansDB.query("SELECT `po_project_name` FROM `po_purchase_req` WHERE `po_transaction` = :po", { replacements: { po: po_number }, type: vansDB.QueryTypes.SELECT });
              if (stmt_project.length > 0) {
                project_name = stmt_project[0].po_project_name == "" ? "N/A" : stmt_project[0].po_project_name;
              } else {
                project_name = "N/A";
              }
            } else {
              if (result[i].in_invoice_id !== "--") {
                invoice_number = result[i].in_invoice_id;
                po_number = "N/A";
              } else {
                invoice_number = "N/A";
                po_number = "N/A";
              }
              project_name = "N/A";
            }

            if (result[i].currency_type == "--" || result[i].currency_type == "" || result[i].currency_type == "364907247") {
              currency = "INR";
            } else {
              currency = "USD";
            }

            let hsncode = "";
            if (result[i].in_hsn_code !== "" && result[i].in_hsn_code !== "--") {
              hsncode = result[i].in_hsn_code;
            } else {
              hsncode = "--";
            }

            finalResult.push({
              DATE: moment(result[i].insert_date, "YYYY-MM-DD HH:mm:ss").format("DD-MM-YYYY HH:mm:ss"),
              COMPONENT: decode(result[i].c_name),
			  DESCRIPTION: decode(result[i].c_specification),	
              PART: result[i].c_part_no,
              HSNCODE: hsncode,
              TYPE: vendor,
              LOCATION: '--',
              RATE: result[i].in_rate,
              CURRENCY: currency,
              INQTY: '--',
              UNIT: result[i].units_name,
              VENDOR_NAME: vendorName,
              VENDOR_CODE: vendorCode,
              PONUMBER: po_number,
              INVOIVENUMBER: invoice_number,
              TRANSACTION: result[i].in_transaction_id,
              ISSUEBY: result[i].user_name,
              COMMENT: result[i].any_remark == "" ? "--" : result[i].any_remark,
              PROJECT: project_name
            });
          }
        } else {
          socket.emit("toastr_error", {
            msg: "no records found for download",
          });
          return;
        }
      }

      if (data.type === "MIN") {

        // INIT AND CHECK
        let check_data = await vansOtherDB.query("SELECT * FROM `user_files_req` WHERE `user_id`= :uid AND `req_code` = 'MIN' AND `status` = 'pending'", {
          replacements: {
            uid: user_id,
          },
          type: vansOtherDB.QueryTypes.SELECT,
        });

        if (check_data.length > 0) {
          fileName = JSON.parse(check_data[0].other_data).url;
        } else {
          fileName = "files/excel/MIN" + (Math.floor(Math.random() * (999 - 100 + 1)) + 100) + ".xlsx";

          let stmt_insert = await vansOtherDB.query("INSERT INTO `user_files_req` ( module_name , request_txt_label , req_code , 	user_id , msg_type , 	status , insert_date , other_data ) VALUES ( :module_name , :request_txt_label , :req_code , :user_id , :msg_type , :status , :insert_date, :other_data ) ", {
            replacements: {
              module_name: "INVT",
              request_txt_label: "MIN Report",
              req_code: "MIN",
              user_id: user_id,
              msg_type: "file",
              status: "pending",
              insert_date: moment(new Date()).format("YYYY-MM-DD HH:mm:ss"),
              other_data: JSON.stringify({
                fileName: "MIN",
                fileUrl: fileName,
              }),
            },
            type: vansOtherDB.QueryTypes.INSERT,
          });
        }
        // END

        let result = await vansDB.query(
          "SELECT *, `rm_transaction`.`insert_date` FROM `rm_transaction` LEFT JOIN `components` ON `rm_transaction`.`components_id` = `components`.`component_key` LEFT JOIN `units` ON `components`.`c_uom` = `units`.`units_id` LEFT JOIN `admin_login` ON `rm_transaction`.`insert_by` = `admin_login`.`CustID` WHERE `components`.`c_type` = 'R' AND DATE_FORMAT(`rm_transaction`.`insert_date`,'%Y-%m-%d') BETWEEN :date1 AND :date2 AND `rm_transaction`.trans_type = 'INWARD' ORDER BY `rm_transaction`.`insert_date` DESC",
          {
            replacements: { date1: date1, date2: date2 },
            type: vansDB.QueryTypes.SELECT,
          }
        );
        if (result.length > 0) {
          for (let i = 0; i < result.length; i++) {
            let vendor = "";
            if (result[i].vendor_type == "v01") {
              vendor = "Vendor";
            } else if (result[i].vendor_type == "j01") {
              vendor = "JWI";
            } else if (result[i].vendor_type == "s01") {
              vendor = "SortIn";
            } else if (result[i].vendor_type == "r01") {
              vendor = "RejIn";
            } else if (result[i].vendor_type == "p01") {
              vendor = "ProdReturn";
            } else {
              vendor = "N/A";
            }
            let vendorName;
            let stmt_vendorName = await vansDB.query("SELECT `ven_name`,`ven_register_id` FROM `ven_basic_detail` WHERE `ven_register_id` = :vendor", {
              replacements: { vendor: result[i].in_vendor_name },
              type: vansDB.QueryTypes.SELECT,
            });
            if (stmt_vendorName.length > 0) {
              vendorName = stmt_vendorName[0].ven_name;
              vendorCode = stmt_vendorName[0].ven_register_id;
            } else {
              vendorName = "N/A";
              vendorCode = "N/A";
            }

            let project_name, invoice_number, po_number;
            if (result[i].in_po_txn_id !== "--") {
              invoice_number = result[i].in_po_txn_id;
              po_number = result[i].in_po_txn_id;

              let stmt_project = await vansDB.query("SELECT `po_project_name` FROM `po_purchase_req` WHERE `po_transaction` = :po", { replacements: { po: po_number }, type: vansDB.QueryTypes.SELECT });
              if (stmt_project.length > 0) {
                project_name = stmt_project[0].po_project_name == "" ? "N/A" : stmt_project[0].po_project_name;
              } else {
                project_name = "N/A";
              }
            } else {
              if (result[i].in_invoice_id !== "--") {
                invoice_number = result[i].in_invoice_id;
                po_number = "N/A";
              } else {
                invoice_number = "N/A";
                po_number = "N/A";
              }
              project_name = "N/A";
            }

            if (result[i].currency_type == "--" || result[i].currency_type == "" || result[i].currency_type == "364907247") {
              currency = "INR";
            } else {
              currency = "USD";
            }

            let hsncode = "";
            if (result[i].in_hsn_code !== "" && result[i].in_hsn_code !== "--") {
              hsncode = result[i].in_hsn_code;
            } else {
              hsncode = "--";
            }

            finalResult.push({
              DATE: moment(result[i].insert_date, "YYYY-MM-DD HH:mm:ss").format("DD-MM-YYYY HH:mm:ss"),
              COMPONENT: decode(result[i].c_name),
			  DESCRIPTION: decode(result[i].c_specification),	
              PART: result[i].c_part_no,
              HSNCODE: hsncode,
              TYPE: vendor,
              LOCATION: '--',
              RATE: result[i].in_rate,
              CURRENCY: currency,
              INQTY: '--',
              UNIT: result[i].units_name,
              VENDOR_NAME: vendorName,
              VENDOR_CODE: vendorCode,
              PONUMBER: po_number,
              INVOIVENUMBER: invoice_number,
              TRANSACTION: result[i].in_transaction_id,
              ISSUEBY: result[i].user_name,
              COMMENT: result[i].any_remark == "" ? "--" : result[i].any_remark,
              PROJECT: project_name,
            });
          }
        } else {
          socket.emit("toastr_error", {
            msg: "no records found for download",
          });
          return;
        }
      }

      const worksheet = xlsx.utils.json_to_sheet(finalResult);
      const workbook = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(workbook, worksheet, "Details");
      xlsx.write(workbook, { bookType: "csv", type: "buffer" });
      console.log(fileName)
      xlsx.writeFile(workbook, fileName);


      let repl = {
        status: "complete",
        user_id: user_id,
        module_name: "INVT",
      }

      if (data.type === "MARKUP") {
        repl.req_code = "MARKUP";
      }

      if (data.type === "NONMARKUP") {
        repl.req_code = "NONMARKUP";
      }

      if (data.type === "MIN") {
        repl.req_code = "MIN";
      }

      let stmt_update = await vansOtherDB.query("UPDATE user_files_req SET status = :status WHERE user_id = :user_id AND module_name = :module_name AND req_code = :req_code ", {
        replacements: repl,
        type: vansOtherDB.QueryTypes.UPDATE
      });

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
  } catch (err) {
    console.log(err.stack);
  }
};
