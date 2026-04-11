const { vansDB, vansOtherDB } = require("../../../config/db/connection");
const xlsx = require("xlsx");
const { sendMail } = require("../../helper");
const helper = require("../../helper");
const jwt = require("jsonwebtoken");
let fs = require("fs");
const moment = require("moment");
const { htmlTemplate } = require("./EmailTemplate/fileDownload");
const { error } = require("console");

exports.componentClosingStock = async function (io, socket) {
  try {
    socket.on("allComponentCloseingStock", async (data) => {
      const [day, month, year] = data.date.split("-");
      const date = `${year}-${month}-${day}`;

      let fileName = "";
      token_res = await verifyToken(`${socket.handshake.auth.token}`);
      let user_id = token_res.crn_id;
      // let user_id = "CRN615672";

      let check_data = await vansOtherDB.query("SELECT * FROM `user_files_req` WHERE `user_id`= :uid AND `req_code` = 'R5VANS' AND `status` = 'pending'", {
        replacements: {
          uid: user_id,
        },
        type: vansOtherDB.QueryTypes.SELECT,
      });

      let c_details = await vansOtherDB.query(
        "SELECT company_address,company_name,company_pin_code,company_gst_no,user_name,company_city FROM ims_company LEFT JOIN mscorpre_vans_ims.admin_login ON ims_company.company_id = admin_login.company_id WHERE admin_login.CustID = :userID",
        {
          replacements: {
            userID: user_id,
          },
          type: vansOtherDB.QueryTypes.SELECT,
        }
      );

      if (check_data.length > 0) {
        fileName = JSON.parse(check_data[0].other_data).fileUrl;
      } else {
        fileName = "files/excel/R5" + (Math.floor(Math.random() * (999 - 100 + 1)) + 100) + ".xlsx";

        let stmt_insert = await vansOtherDB.query(
          "INSERT INTO `user_files_req` ( module_name , request_txt_label , req_date,req_code , 	user_id , msg_type , 	status , insert_date , other_data ) VALUES ( :module_name , :request_txt_label , :req_date,:req_code , :user_id , :msg_type , :status , :insert_date, :other_data ) ",
          {
            replacements: {
              module_name: "VANS",
              request_txt_label: "R5 Report",
              req_date: date,
              req_code: "R5VANS",
              user_id: user_id,
              msg_type: "file",
              status: "pending",
              insert_date: moment(new Date()).format("YYYY-MM-DD HH:mm:ss"),
              other_data: JSON.stringify({
                fileName: "R5 Report",
                fileUrl: fileName,
              }),
            },
            type: vansOtherDB.QueryTypes.INSERT,
          }
        );
      }

      let user = await vansDB.query("SELECT `Email_ID`,`user_name` from `admin_login` WHERE `CustID`= :CustID", {
        replacements: {
          CustID: user_id,
        },
        type: vansDB.QueryTypes.SELECT,
      });
      let userEmail = user[0].Email_ID;

      const stmt_all_components = await vansDB.query("SELECT c_part_no, c_name, component_key, c_specification FROM components WHERE c_type = 'R'", {
      // const stmt_all_components = await vansDB.query("SELECT c_part_no, c_name, component_key, c_specification FROM components WHERE component_key  = '1678285090949'", {
        type: vansDB.QueryTypes.SELECT,
      });
      let resultOfColusingStock = [];
      if (stmt_all_components.length > 0) {
        const length = stmt_all_components.length;
        for (let i = 0; i < length; i++) {
          //INWARD QUANTITY FOR COST CENTER KEY 1 (Navs)
          let stmt5 = await vansDB.query(
            `SELECT COALESCE(SUM(qty + other_qty), 0) AS Inward
           FROM rm_location 
           WHERE components_id = :component AND 
                 (trans_type = 'INWARD' OR trans_type = 'TRANSFER') AND 
                 cost_center = :costCenterKey AND DATE_FORMAT(insert_date,'%Y-%m-%d') < :insertDateFormatted`,
            {
              replacements: {
                component: stmt_all_components[i].component_key,
                costCenterKey: `2023122105635288`,
                insertDateFormatted: date,
              },
              type: vansDB.QueryTypes.SELECT,
            }
          );

          let inward_key1_qty;
          if (stmt5.length > 0) {
            inward_key1_qty = helper.number(stmt5[0].Inward);
          } else {
            inward_key1_qty = 0;
          }

          // INWARD QUANTITY FOR COST CENTER KEY 2 (Vans)
          let stmt6 = await vansDB.query(
            `SELECT COALESCE(SUM(qty + other_qty), 0) AS Inward
           FROM rm_location 
           WHERE components_id = :component AND 
                 (trans_type = 'INWARD' OR trans_type = 'TRANSFER') AND 
                 cost_center = :costCenterKey AND DATE_FORMAT(insert_date,'%Y-%m-%d') < :insertDateFormatted`,
            {
              replacements: {
                component: stmt_all_components[i].component_key,
                costCenterKey: `2023122105635289`,
                insertDateFormatted: date,
              },
              type: vansDB.QueryTypes.SELECT,
            }
          );

          let inward_key2_qty;
          if (stmt6.length > 0) {
            inward_key2_qty = helper.number(stmt6[0].Inward);
          } else {
            inward_key2_qty = 0;
          }

          // INWARD QUANTITY FOR COST CENTER KEY 3 (SILICON)
          let stmt9 = await vansDB.query(
            `SELECT COALESCE(SUM(qty + other_qty), 0) AS Inward
           FROM rm_location 
           WHERE components_id = :component AND 
                 (trans_type = 'INWARD' OR trans_type = 'TRANSFER') AND 
                 cost_center = :costCenterKey AND DATE_FORMAT(insert_date,'%Y-%m-%d') < :insertDateFormatted`,
            {
              replacements: {
                component: stmt_all_components[i].component_key,
                costCenterKey: `2023122105635290`,
                insertDateFormatted: date,
              },
              type: vansDB.QueryTypes.SELECT,
            }
          );

          let inward_key3_qty = stmt9.length > 0 ? helper.number(stmt9[0].Inward) : 0;

          // OUTWARD QUANTITY FOR COST CENTER KEY 1 (Navs)
          let stmt7 = await vansDB.query(
            `SELECT COALESCE(SUM(qty + other_qty), 0) AS Outward
           FROM rm_location 
           WHERE components_id = :component AND 
                 trans_type NOT IN ('INWARD', 'INTRANSIT', 'CANCELLED', 'INTRANSITISSUE') AND 
                 cost_center = :costCenterKey AND DATE_FORMAT(insert_date,'%Y-%m-%d') < :insertDateFormatted`,
            {
              replacements: {
                component: stmt_all_components[i].component_key,
                costCenterKey: `2023122105635288`,
                insertDateFormatted: date,
              },
              type: vansDB.QueryTypes.SELECT,
            }
          );

          let outward_key1_qty;
          if (stmt7.length > 0) {
            outward_key1_qty = helper.number(stmt7[0].Outward);
          } else {
            outward_key1_qty = 0;
          }

          // OUTWARD QUANTITY FOR COST CENTER KEY 2 (Vans)
          let stmt8 = await vansDB.query(
            `SELECT COALESCE(SUM(qty + other_qty), 0) AS Outward
           FROM rm_location 
           WHERE components_id = :component AND 
                 trans_type NOT IN ('INWARD', 'INTRANSIT', 'CANCELLED', 'INTRANSITISSUE') AND 
                 cost_center = :costCenterKey AND DATE_FORMAT(insert_date,'%Y-%m-%d') < :insertDateFormatted`,
            {
              replacements: {
                component: stmt_all_components[i].component_key,
                costCenterKey: `2023122105635289`,
                insertDateFormatted: date,
              },
              type: vansDB.QueryTypes.SELECT,
            }
          );
          console.log("stmt8", stmt8);

          let outward_key2_qty;
          if (stmt8.length > 0) {
            outward_key2_qty = helper.number(stmt8[0].Outward);
          } else {
            outward_key2_qty = 0;
          }
          // OUTWARD QUANTITY FOR COST CENTER KEY 3 (SILICON)
          let stmt10 = await vansDB.query(
            `SELECT COALESCE(SUM(qty + other_qty), 0) AS Outward
           FROM rm_location 
           WHERE components_id = :component AND 
                 trans_type NOT IN ('INWARD', 'INTRANSIT', 'CANCELLED', 'INTRANSITISSUE') AND 
                 cost_center = :costCenterKey AND DATE_FORMAT(insert_date,'%Y-%m-%d') < :insertDateFormatted`,
            {
              replacements: {
                component: stmt_all_components[i].component_key,
                costCenterKey: `2023122105635290`,
                insertDateFormatted: date,
              },
              type: vansDB.QueryTypes.SELECT,
            }
          );

          let outward_key3_qty = stmt10.length > 0 ? helper.number(stmt10[0].Outward) : 0;

          let closing_qty_key1 = helper.number(inward_key1_qty) - helper.number(outward_key1_qty);
          let closing_qty_key2 = helper.number(inward_key2_qty) - helper.number(outward_key2_qty);
          let closing_qty_key3 = helper.number(inward_key3_qty) - helper.number(outward_key3_qty);

          console.log("qty", closing_qty_key1, closing_qty_key2, closing_qty_key3);

          let vansData = await vansDB.query(
            "SELECT in_rate,currency_type,exchange_rate FROM rm_location WHERE cost_center = :cost_center AND trans_type = 'INWARD' AND `components_id` = :component  ORDER BY rm_location.ID DESC LIMIT 1",
            {
              replacements: {
                cost_center: "2023122105635289",
                component: stmt_all_components[i].component_key,
              },
              type: vansDB.QueryTypes.SELECT,
            }
          );
          let NavsData = await vansDB.query(
            "SELECT in_rate,currency_type,exchange_rate FROM rm_location WHERE cost_center = :cost_center  AND trans_type = 'INWARD' AND `components_id` = :component  ORDER BY rm_location.ID DESC LIMIT 1",
            {
              replacements: {
                cost_center: "2023122105635288",
                component: stmt_all_components[i].component_key,
              },
              type: vansDB.QueryTypes.SELECT,
            }
          );

          let SiliconData = await vansDB.query(
            "SELECT in_rate,currency_type,exchange_rate FROM rm_location WHERE cost_center = :cost_center  AND trans_type = 'INWARD' AND `components_id` = :component  ORDER BY rm_location.ID DESC LIMIT 1",
            {
              replacements: {
                cost_center: "2023122105635290",
                component: stmt_all_components[i].component_key,
              },
              type: vansDB.QueryTypes.SELECT,
            }
          );

          let navs_rate = NavsData.length > 0 ? NavsData[0].in_rate : 0;
          let navs_exch_rate = NavsData.length > 0 ? NavsData[0].exchange_rate : 0;
          let vans_rate = vansData.length > 0 ? vansData[0].in_rate : 0;
          let vans_exch_rate = vansData.length > 0 ? vansData[0].exchange_rate : 0;
          let silicon_rate = SiliconData.length > 0 ? SiliconData[0].in_rate : 0;
          let silicon_exch_rate = SiliconData.length > 0 ? SiliconData[0].exchange_rate : 0;

          let lastInStmt = await vansDB.query("SELECT insert_date FROM rm_location WHERE components_id = :component AND trans_type = 'INWARD' ORDER BY insert_date DESC LIMIT 1", {
            replacements: { component: stmt_all_components[i].component_key }, // Fixed here
            type: vansDB.QueryTypes.SELECT,
          });

          let lasttIN = "N/A";
          if (lastInStmt.length > 0) {
            lasttIN = moment(lastInStmt[0].insert_date).format("DD-MM-YYYY");
          }

          //last outward transaction date
          let lastOutStmt = await vansDB.query("SELECT insert_date FROM rm_location WHERE components_id = :component AND trans_type = 'ISSUE' ORDER BY insert_date DESC LIMIT 1", {
            replacements: { component: stmt_all_components[i].component_key }, // Fixed here
            type: vansDB.QueryTypes.SELECT,
          });

          let lasttOUT = "N/A";
          if (lastOutStmt.length > 0) {
            lasttOUT = moment(lastOutStmt[0].insert_date).format("DD-MM-YYYY");
          }

          resultOfColusingStock.push({
            PART_CODE: stmt_all_components[i].c_part_no,
            PART_NAME: stmt_all_components[i].c_name,
            DESC: stmt_all_components[i].c_specification,
            NAVS_STOCK: closing_qty_key1,
            VANS_STOCK: closing_qty_key2,
            SILICON_STOCK: closing_qty_key3,
            TOTAL_STOCK: closing_qty_key1 + closing_qty_key2 + closing_qty_key3,
            LST_NAVS_RATE: navs_rate,
            LST_VANS_RATE: vans_rate,
            LST_SILICON_RATE: silicon_rate,
            AMT_NAVS_LC: closing_qty_key1 * navs_rate * navs_exch_rate,
            AMT_VANS_LC: closing_qty_key2 * vans_rate * vans_exch_rate,
            AMT_SILICON_LC: closing_qty_key3 * silicon_rate * silicon_exch_rate,
            AMT_NAVS_FC: closing_qty_key1 * navs_rate,
            AMT_VANS_FC: closing_qty_key2 * vans_rate,
            AMT_SILICON_FC: closing_qty_key3 * silicon_rate,
            LAST_IN: lasttIN,
            LAST_OUT: lasttOUT,

            REQ_STOCK_DATE: date,
          });
        }
        if (resultOfColusingStock.length > 0) {
          console.log("resultOfColusingStock", resultOfColusingStock);
          const ReportHeader = xlsx.utils.json_to_sheet(
            [
              {
                A: `${c_details[0].company_name}`,
              },
            ],
            {
              header: ["A"],
              skipHeader: true,
            }
          );
          ReportHeader["!merges"] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },
            { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } },
            { s: { r: 2, c: 0 }, e: { r: 2, c: 5 } },
            { s: { r: 3, c: 0 }, e: { r: 3, c: 5 } },
            { s: { r: 4, c: 0 }, e: { r: 4, c: 5 } },
            { s: { r: 5, c: 0 }, e: { r: 5, c: 5 } },
            { s: { r: 6, c: 0 }, e: { r: 6, c: 5 } },
          ];

          xlsx.utils.sheet_add_json(
            ReportHeader,
            [
              {
                A2: `${c_details[0].company_address}`,
              },
            ],
            {
              skipHeader: true,
              origin: "A2",
            }
          );

          xlsx.utils.sheet_add_json(
            ReportHeader,
            [
              {
                A3: `${c_details[0].company_city} - ${c_details[0].company_pin_code}`,
              },
            ],
            {
              skipHeader: true,
              origin: "A3",
            }
          );

          xlsx.utils.sheet_add_json(
            ReportHeader,
            [
              {
                A4: `GST Ragistration : ${c_details[0].company_gst_no}`,
              },
            ],
            {
              skipHeader: true,
              origin: "A4",
            }
          );

          xlsx.utils.sheet_add_json(
            ReportHeader,
            [
              {
                A5: `R5 REPORT - ALL ITEM CLOSING STOCK REPORT`,
              },
            ],
            {
              skipHeader: true,
              origin: "A5",
            }
          );

          xlsx.utils.sheet_add_json(
            ReportHeader,
            [
              {
                A6: `Requested Date : ${moment(new Date()).format("DD-MM-YYYY HH:mm:ss")}`,
              },
            ],
            {
              skipHeader: true,
              origin: "A6",
            }
          );

          xlsx.utils.sheet_add_json(
            ReportHeader,
            [
              {
                A7: `Generated By : ${c_details[0].user_name} `,
              },
            ],
            {
              skipHeader: true,
              origin: "A7",
            }
          );

          xlsx.utils.sheet_add_json(
            ReportHeader,
            [
              {
                A9: "PART_CODE",
                B9: "PART_NAME",
                C9: "DESC",
                D9: "NAVS_STOCK",
                E9: "VANS_STOCK",
                F9: "SILICON_STOCK",
                G9: "TOTAL_STOCK",
                H9: "LST_NAVS_RATE",
                I9: "LST_VANS_RATE",
                J9: "LST_SILICON_RATE",
                K9: "AMT_NAVS_LC",
                L9: "AMT_VANS_LC",
                M9: "AMT_SILICON_LC",
                N9: "AMT_NAVS_FC",
                O9: "AMT_VANS_FC",
                P9: "AMT_SILICON_FC",
                Q9: "LAST_IN",
                R9: "LAST_OUT",
                S9: "REQ_STOCK_DATE",

              },
            ],
            {
              skipHeader: true,
              origin: "A9",
            }
          );

          xlsx.utils.sheet_add_json(ReportHeader, resultOfColusingStock, { skipHeader: true, origin: "A10" });
          const workbook = xlsx.utils.book_new();
          xlsx.utils.book_append_sheet(workbook, ReportHeader, "Details");
          xlsx.write(workbook, { bookType: "csv", type: "buffer" });
          xlsx.writeFile(workbook, fileName);
          console.log("Data added to Excel file successfully.");

          let attachment = [
            {
              filename: fileName,
              content: fs.readFileSync(fileName),
            },
          ];

          await sendMail(userEmail, "", "R5 Report [File Ready for download]", htmlTemplate(user[0].user_name, new Date(), "R5", "https://socket.mscapi.live/" + fileName), attachment);

          let stmt_update = await vansOtherDB.query("UPDATE user_files_req SET status = :status WHERE user_id = :user_id AND module_name = :module_name AND req_code = :req_code ", {
            replacements: {
              status: "complete",
              user_id: user_id,
              module_name: "VANS",
              req_code: "R5VANS",
            },
          });
        } else {
        }
      } else {
        socket.emit("Component Not Found");
      }

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
    });
  } catch (error) {
    socket.emit("errorMs", error.stack); 
  }
};
