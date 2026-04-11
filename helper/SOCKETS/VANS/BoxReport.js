// const { vansDB, vansOtherDB } = require("../../../config/db/connection");
// const xlsx = require("xlsx");
// const { sendMail, randomNumber } = require("../../helper");
// const jwt = require("jsonwebtoken");
// let fs = require("fs");
// const moment = require("moment");
// const { htmlTemplate } = require("./EmailTemplate/fileDownload");
// const { verifyToken } = require("../../utils");

// exports.stockPart = async function (io, socket) {
//   try {
//     socket.on("stockPartBoxWise", async (data) => {
//       const reqData = data;
//       const ReportDate = moment(reqData.date, "DD-MM-YYYY").format("YYYY-MM-DD");

//       let fileName = "";
//       token_res = await verifyToken(`${socket.handshake.auth.token}`);
//       const user_id = token_res.crn_id;

//       // INIT
//       const check_data = await vansOtherDB.query("SELECT * FROM `user_files_req` WHERE `user_id`= :uid AND `req_code` = 'R1VANS' AND `status` = 'pending' AND req_date = :date", {
//         replacements: {
//           uid: user_id,
//           date: ReportDate,
//         },
//         type: vansOtherDB.QueryTypes.SELECT,
//       });

//       let c_details = await vansOtherDB.query(
//         "SELECT company_address,company_name,company_pin_code,company_gst_no,user_name,company_city FROM ims_company LEFT JOIN mscorpre_vans_ims.admin_login ON ims_company.company_id = admin_login.company_id WHERE admin_login.CustID = :userID",
//         {
//           replacements: {
//             userID: user_id,
//           },
//           type: vansOtherDB.QueryTypes.SELECT,
//         }
//       );

//       if (check_data.length > 0) {
//         fileName = JSON.parse(check_data[0].other_data).fileUrl;
//       } else {
//         fileName = "files/excel/R1" + (Math.floor(Math.random() * (999 - 100 + 1)) + 100) + ".csv";

//         let stmt_insert = await vansOtherDB.query(
//           "INSERT INTO `user_files_req` ( module_name , request_txt_label , req_code, req_date , 	user_id , msg_type , 	status , insert_date , other_data ) VALUES ( :module_name , :request_txt_label , :req_code , :req_date , :user_id , :msg_type , :status , :insert_date, :other_data ) ",
//           {
//             replacements: {
//               module_name: "VANS",
//               request_txt_label: "R1 Report",
//               req_code: "R1VANS",
//               user_id: user_id,
//               req_date: reqData.date,
//               msg_type: "file",
//               status: "pending",
//               insert_date: moment(new Date()).format("YYYY-MM-DD HH:mm:ss"),
//               other_data: JSON.stringify({
//                 fileName: "R1 Report",
//                 fileUrl: fileName,
//                 date: data.date,
//               }),
//             },
//             type: vansOtherDB.QueryTypes.INSERT,
//           }
//         );
//       }

//       let user = await vansDB.query("SELECT `Email_ID`,`user_name` from `admin_login` WHERE `CustID`= :CustID", {
//         replacements: {
//           CustID: user_id,
//         },
//         type: vansDB.QueryTypes.SELECT,
//       });
//       let userEmail = user[0].Email_ID;

//       let finalResult = [];

//       // let main_stmt = await vansDB.query("SELECT `loc_in`,`components_id` FROM rm_location WHERE loc_in != '--' AND DATE_FORMAT( rm_location.insert_date , '%Y-%m-%d') < :date  GROUP BY loc_in", {
//       //  replacements: { date: ReportDate },
//       // type: vansDB.QueryTypes.SELECT,
//       // });

//       let main_stmt = await vansDB.query("SELECT `loc_in` FROM rm_location WHERE loc_in != '--' GROUP BY loc_in", {
//         type: vansDB.QueryTypes.SELECT,
//       });

//       //To count the total unique boxes which is going to inserted in excel sheets
//       let total_box = new Set();

//       for (let j = 0; j < main_stmt.length; j++) {
//         let stmt = await vansDB.query(
//           "SELECT components_id, loc_in, SUM(qty) as qty , c_part_no, c_make, c_name,components.c_specification, units_name , in_transaction_id , in_rate , exchange_rate , cost_center_name FROM rm_location LEFT JOIN components ON rm_location.components_id = components.component_key LEFT JOIN units ON components.c_uom = units.units_id  LEFT JOIN cost_center ON cost_center.cost_center_key = rm_location.cost_center  WHERE (rm_location.trans_type = 'INWARD' OR rm_location.trans_type = 'TRANSFER') AND loc_in = :loc_in GROUP BY components_id",
//           {
//             replacements: { loc_in: main_stmt[j].loc_in },
//             type: vansDB.QueryTypes.SELECT,
//           }
//         );

//         for (let i = 0; i < stmt.length; i++) {
//           let stmt2 = await vansDB.query(
//             "SELECT SUM(qty) as qty FROM `rm_location` LEFT JOIN `components` ON `rm_location`.`components_id` = `components`.`component_key` WHERE (`rm_location`.`trans_type` = 'ISSUE' OR `rm_location`.`trans_type` = 'TRANSFER') AND loc_out = :loc_out AND rm_location.components_id = :component  GROUP BY loc_out",
//             {
//               replacements: { loc_out: stmt[i].loc_in, component: stmt[i].components_id },
//               type: vansDB.QueryTypes.SELECT,
//             }
//           );

//           let closing_qty = Number(stmt[i].qty);
//           if (stmt2.length > 0) {
//             closing_qty = Number(stmt[i].qty) - Number(stmt2[0].qty);
//           }
//           if (closing_qty == 0) {
//             continue;
//           }

//           //LAST RATE
//           let stmt10 = await vansDB.query(
//             "SELECT `rm_location`.`in_rate`, `rm_location`.`exchange_rate`, `ims_currency`.`currency_symbol` FROM `rm_location` LEFT JOIN `ims_currency` ON `rm_location`.`currency_type` = `ims_currency`.`currency_id` WHERE `rm_location`.`trans_type` = 'INWARD' AND `rm_location`.`components_id` = :component ORDER BY `rm_location`.`ID` DESC LIMIT 1",
//             {
//               replacements: { component: stmt[i].components_id },
//               type: vansDB.QueryTypes.SELECT,
//             }
//           );

//           let last_in_rate = "N/A";
//           let l_in_rate = "N/A";
//           let LExRate = "N/A";
//           if (stmt10.length > 0) {
//             last_in_rate = stmt10[0].currency_symbol + " " + stmt10[0].in_rate;
//             l_in_rate = stmt10[0].in_rate;
//             LExRate = stmt10[0].exchange_rate;
//           }

//           // Adding last inward transaction date
//           let lastInStmt = await vansDB.query("SELECT insert_date FROM rm_location WHERE components_id = :component AND trans_type = 'INWARD' ORDER BY insert_date DESC LIMIT 1", {
//             replacements: { component: stmt[i].components_id },
//             type: vansDB.QueryTypes.SELECT,
//           });

//           let lasttIN = "N/A";
//           if (lastInStmt.length > 0) {
//             lasttIN = moment(lastInStmt[0].insert_date).format("DD-MM-YYYY");
//           }

//           //last outward transaction date
//           let lastOutStmt = await vansDB.query("SELECT insert_date FROM rm_location WHERE components_id = :component AND trans_type = 'ISSUE' ORDER BY insert_date DESC LIMIT 1", {
//             replacements: { component: stmt[i].components_id },
//             type: vansDB.QueryTypes.SELECT,
//           });

//           let lasttOUT = "N/A";
//           if (lastOutStmt.length > 0) {
//             lasttOUT = moment(lastOutStmt[0].insert_date).format("DD-MM-YYYY");
//           }

//           if (closing_qty !== 0) {
//             //to find the unique boxes we pushes boxes into set
//             total_box.add(stmt[i].loc_in);
//             finalResult.push({
//               COST_CENTER: stmt[i].cost_center_name,
//               LOCATION: stmt[i].loc_in,
//               PART: stmt[i].c_part_no,
//               NAME: stmt[i].c_name,
//               DESC: stmt[i].c_specification,
//               MAKE: stmt[i].c_make,
//               UNIT: stmt[i].units_name,
//               RATE: last_in_rate,
//               CLOSING_QUANTITY: closing_qty,
//               AMOUNT_LC: (Number(l_in_rate) * Number(closing_qty) * Number(LExRate)).toFixed(4),
//               AMOUNT_FC: Number(l_in_rate) * Number(closing_qty).toFixed(4),
//               MIN_NO: stmt[i].in_transaction_id,
//               LAST_IN: lasttIN,
//               LAST_OUT: lasttOUT,
//             });
//           }
//         }
//       }

//       finalResult.push({
//         COST_CENTER: "",
//         LOCATION: "TOTAL BOXES",
//         PART: total_box.size,
//         NAME: "",
//         DESC: "",
//         MAKE: "",
//         UNIT: "DATE",
//         RATE: "",
//         CLOSING_QUANTITY: reqData.date,
//         AMOUNT_LC: "",
//         AMOUNT_FC: "",
//         MIN_NO: "",
//         LAST_IN: "",
//         LAST_OUT: "",
//       });

//       const ReportHeader = xlsx.utils.json_to_sheet(
//         [
//           {
//             A: `${c_details[0].company_name}`,
//           },
//         ],
//         {
//           header: ["A"],
//           skipHeader: true,
//         }
//       );

//       ReportHeader["!merges"] = [
//         { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },
//         { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } },
//         { s: { r: 2, c: 0 }, e: { r: 2, c: 5 } },
//         { s: { r: 3, c: 0 }, e: { r: 3, c: 5 } },
//         { s: { r: 4, c: 0 }, e: { r: 4, c: 5 } },
//         { s: { r: 5, c: 0 }, e: { r: 5, c: 5 } },
//         { s: { r: 6, c: 0 }, e: { r: 6, c: 5 } },
//       ];

//       xlsx.utils.sheet_add_json(
//         ReportHeader,
//         [
//           {
//             A2: `${c_details[0].company_address}`,
//           },
//         ],
//         {
//           skipHeader: true,
//           origin: "A2",
//         }
//       );

//       xlsx.utils.sheet_add_json(
//         ReportHeader,
//         [
//           {
//             A3: `${c_details[0].company_city} - ${c_details[0].company_pin_code}`,
//           },
//         ],
//         {
//           skipHeader: true,
//           origin: "A3",
//         }
//       );

//       xlsx.utils.sheet_add_json(
//         ReportHeader,
//         [
//           {
//             A4: `GST Ragistration : ${c_details[0].company_gst_no}`,
//           },
//         ],
//         {
//           skipHeader: true,
//           origin: "A4",
//         }
//       );

//       xlsx.utils.sheet_add_json(
//         ReportHeader,
//         [
//           {
//             A5: `R1 REPORT - BOX WISE REPORT`,
//           },
//         ],
//         {
//           skipHeader: true,
//           origin: "A5",
//         }
//       );

//       xlsx.utils.sheet_add_json(
//         ReportHeader,
//         [
//           {
//             A6: `Requested Date : ${moment(new Date()).format("DD-MM-YYYY HH:mm:ss")}`,
//           },
//         ],
//         {
//           skipHeader: true,
//           origin: "A6",
//         }
//       );

//       xlsx.utils.sheet_add_json(
//         ReportHeader,
//         [
//           {
//             A7: `Generated By : ${c_details[0].user_name} `,
//           },
//         ],
//         {
//           skipHeader: true,
//           origin: "A7",
//         }
//       );

//       xlsx.utils.sheet_add_json(
//         ReportHeader,
//         [
//           {
//             A9: "COST_CENTER",
//             B9: "LOCATION",
//             C9: "PART",
//             D9: "NAME",
//             E9: "DESC",
//             F9: "MAKE",
//             G9: "UNIT",
//             H9: "RATE",
//             I9: "CLOSING_QUANTITY",
//             J9: "AMOUNT_LC",
//             K9: "AMOUNT_FC",
//             L9: "MIN_NO",
//             M9: "LAST_IN",
//             N9: "LAST_OUT",
//           },
//         ],
//         {
//           skipHeader: true,
//           origin: "A9",
//         }
//       );

//       xlsx.utils.sheet_add_json(ReportHeader, finalResult, { skipHeader: true, origin: "A10" });
//       const workbook = xlsx.utils.book_new();
//       xlsx.utils.book_append_sheet(workbook, ReportHeader, "Details");
//       xlsx.write(workbook, { bookType: "csv", type: "buffer" });
//       xlsx.writeFile(workbook, fileName);

//       let attachment = [
//         {
//           filename: fileName,
//           content: fs.readFileSync(fileName),
//         },
//       ];

//       await sendMail(
//         userEmail,
//         "",
//         "R1 Report [File Ready for download] Ref:" + randomNumber(),
//         htmlTemplate(user[0].user_name, new Date(), "R1", "https://socket.mscapi.live/" + fileName),
//         attachment
//       );

//       let stmt_update = await vansOtherDB.query("UPDATE user_files_req SET status = :status WHERE user_id = :user_id AND module_name = :module_name AND req_code = :req_code AND req_date = :date ", {
//         replacements: {
//           status: "complete",
//           user_id: user_id,
//           module_name: "VANS",
//           req_code: "R1VANS",
//           date: reqData.date ? reqData.date : new Date(),
//         },
//       });
//     });
//   } catch (error) {
//     socket.emit("errorMs", error.stack);
//   }
// };

// optimsed code of r1 


const { vansDB, vansOtherDB } = require("../../../config/db/connection");
const xlsx = require("xlsx");
const { sendMail, randomNumber } = require("../../helper");
const jwt = require("jsonwebtoken");
let fs = require("fs");
const moment = require("moment");
const { htmlTemplate } = require("./EmailTemplate/fileDownload");
const { verifyToken } = require("../../utils");

exports.stockPart = async function (io, socket) {
  try {
    socket.on("stockPartBoxWise", async (data) => {
      const reqData = data;
      const ReportDate = moment(reqData.date, "DD-MM-YYYY").format("YYYY-MM-DD");

      let fileName = "";
      token_res = await verifyToken(`${socket.handshake.auth.token}`);
      const user_id = token_res.crn_id;

      // Check if file request already exists
      const check_data = await vansOtherDB.query(
        "SELECT * FROM `user_files_req` WHERE `user_id`= :uid AND `req_code` = 'R1VANS' AND `status` = 'pending' AND req_date = :date", 
        {
          replacements: { uid: user_id, date: ReportDate },
          type: vansOtherDB.QueryTypes.SELECT,
        }
      );

      // Get company details
      let c_details = await vansOtherDB.query(
        "SELECT company_address,company_name,company_pin_code,company_gst_no,user_name,company_city FROM ims_company LEFT JOIN mscorpre_vans_ims.admin_login ON ims_company.company_id = admin_login.company_id WHERE admin_login.CustID = :userID",
        {
          replacements: { userID: user_id },
          type: vansOtherDB.QueryTypes.SELECT,
        }
      );

      // Handle file name generation
      if (check_data.length > 0) {
        fileName = JSON.parse(check_data[0].other_data).fileUrl;
      } else {
        fileName = "files/excel/R1" + (Math.floor(Math.random() * (999 - 100 + 1)) + 100) + ".csv";

        await vansOtherDB.query(
          "INSERT INTO `user_files_req` ( module_name , request_txt_label , req_code, req_date , user_id , msg_type , status , insert_date , other_data ) VALUES ( :module_name , :request_txt_label , :req_code , :req_date , :user_id , :msg_type , :status , :insert_date, :other_data )",
          {
            replacements: {
              module_name: "VANS",
              request_txt_label: "R1 Report",
              req_code: "R1VANS",
              user_id: user_id,
              req_date: reqData.date,
              msg_type: "file",
              status: "pending",
              insert_date: moment(new Date()).format("YYYY-MM-DD HH:mm:ss"),
              other_data: JSON.stringify({
                fileName: "R1 Report",
                fileUrl: fileName,
                date: data.date,
              }),
            },
            type: vansOtherDB.QueryTypes.INSERT,
          }
        );
      }

      // Get user email
      let user = await vansDB.query(
        "SELECT `Email_ID`,`user_name` from `admin_login` WHERE `CustID`= :CustID", 
        {
          replacements: { CustID: user_id },
          type: vansDB.QueryTypes.SELECT,
        }
      );
      let userEmail = user[0].Email_ID;

      // OPTIMIZED QUERY: Get all data in fewer queries
      const stockData = await vansDB.query(`
        WITH inward_stock AS (
          SELECT 
            rl.loc_in,
            rl.components_id,
            SUM(rl.qty) as inward_qty,
            c.c_part_no,
            c.c_make,
            c.c_name,
            c.c_specification,
            u.units_name,
            rl.in_transaction_id,
            cc.cost_center_name
          FROM rm_location rl
          LEFT JOIN components c ON rl.components_id = c.component_key
          LEFT JOIN units u ON c.c_uom = u.units_id
          LEFT JOIN cost_center cc ON cc.cost_center_key = rl.cost_center
          WHERE (rl.trans_type = 'INWARD' OR rl.trans_type = 'TRANSFER')
            AND rl.loc_in != '--'
          GROUP BY rl.loc_in, rl.components_id, c.c_part_no, c.c_make, c.c_name, 
                   c.c_specification, u.units_name, rl.in_transaction_id, cc.cost_center_name
        ),
        outward_stock AS (
          SELECT 
            rl.loc_out,
            rl.components_id,
            SUM(rl.qty) as outward_qty
          FROM rm_location rl
          WHERE (rl.trans_type = 'ISSUE' OR rl.trans_type = 'TRANSFER')
            AND rl.loc_out != '--'
          GROUP BY rl.loc_out, rl.components_id
        ),
        combined_stock AS (
          SELECT 
            i.*,
            COALESCE(o.outward_qty, 0) as outward_qty,
            (i.inward_qty - COALESCE(o.outward_qty, 0)) as closing_qty
          FROM inward_stock i
          LEFT JOIN outward_stock o ON i.loc_in = o.loc_out AND i.components_id = o.components_id
        )
        SELECT *
        FROM combined_stock
        WHERE closing_qty > 0
        ORDER BY loc_in, c_part_no
      `, {
        type: vansDB.QueryTypes.SELECT,
      });

      // Get all last rates in one query
      const lastRatesQuery = await vansDB.query(`
        SELECT DISTINCT
          rl1.components_id,
          rl1.in_rate,
          rl1.exchange_rate,
          ic.currency_symbol
        FROM rm_location rl1
        LEFT JOIN ims_currency ic ON rl1.currency_type = ic.currency_id
        INNER JOIN (
          SELECT components_id, MAX(ID) as max_id
          FROM rm_location
          WHERE trans_type = 'INWARD'
          GROUP BY components_id
        ) rl2 ON rl1.components_id = rl2.components_id AND rl1.ID = rl2.max_id
      `, {
        type: vansDB.QueryTypes.SELECT,
      });

      // Get all last inward dates in one query
      const lastInwardDatesQuery = await vansDB.query(`
        SELECT DISTINCT
          rl1.components_id,
          rl1.insert_date
        FROM rm_location rl1
        INNER JOIN (
          SELECT components_id, MAX(insert_date) as max_date
          FROM rm_location
          WHERE trans_type = 'INWARD'
          GROUP BY components_id
        ) rl2 ON rl1.components_id = rl2.components_id AND rl1.insert_date = rl2.max_date
      `, {
        type: vansDB.QueryTypes.SELECT,
      });

      // Get all last outward dates in one query
      const lastOutwardDatesQuery = await vansDB.query(`
        SELECT DISTINCT
          rl1.components_id,
          rl1.insert_date
        FROM rm_location rl1
        INNER JOIN (
          SELECT components_id, MAX(insert_date) as max_date
          FROM rm_location
          WHERE trans_type = 'ISSUE'
          GROUP BY components_id
        ) rl2 ON rl1.components_id = rl2.components_id AND rl1.insert_date = rl2.max_date
      `, {
        type: vansDB.QueryTypes.SELECT,
      });

      // Create lookup maps for O(1) access
      const lastRatesMap = new Map();
      lastRatesQuery.forEach(row => {
        lastRatesMap.set(row.components_id, {
          rate: row.in_rate,
          exchange_rate: row.exchange_rate,
          currency_symbol: row.currency_symbol
        });
      });

      const lastInwardMap = new Map();
      lastInwardDatesQuery.forEach(row => {
        lastInwardMap.set(row.components_id, row.insert_date);
      });

      const lastOutwardMap = new Map();
      lastOutwardDatesQuery.forEach(row => {
        lastOutwardMap.set(row.components_id, row.insert_date);
      });

      // Process results
      let finalResult = [];
      let total_box = new Set();

      stockData.forEach(row => {
        if (row.closing_qty <= 0) return;

        total_box.add(row.loc_in);

        // Get last rate info
        const rateInfo = lastRatesMap.get(row.components_id);
        let last_in_rate = "N/A";
        let l_in_rate = "N/A";
        let LExRate = "N/A";

        if (rateInfo) {
          last_in_rate = `${rateInfo.currency_symbol || ''} ${rateInfo.rate || ''}`;
          l_in_rate = rateInfo.rate || 0;
          LExRate = rateInfo.exchange_rate || 1;
        }

        // Get last transaction dates
        const lastInDate = lastInwardMap.get(row.components_id);
        const lastOutDate = lastOutwardMap.get(row.components_id);

        const lasttIN = lastInDate ? moment(lastInDate).format("DD-MM-YYYY") : "N/A";
        const lasttOUT = lastOutDate ? moment(lastOutDate).format("DD-MM-YYYY") : "N/A";

        finalResult.push({
          COST_CENTER: row.cost_center_name || "",
          LOCATION: row.loc_in || "",
          PART: row.c_part_no || "",
          NAME: row.c_name || "",
          DESC: row.c_specification || "",
          MAKE: row.c_make || "",
          UNIT: row.units_name || "",
          RATE: last_in_rate,
          CLOSING_QUANTITY: row.closing_qty,
          AMOUNT_LC: (Number(l_in_rate) * Number(row.closing_qty) * Number(LExRate)).toFixed(4),
          AMOUNT_FC: (Number(l_in_rate) * Number(row.closing_qty)).toFixed(4),
          MIN_NO: row.in_transaction_id || "",
          LAST_IN: lasttIN,
          LAST_OUT: lasttOUT,
        });
      });

      // Add summary row
      finalResult.push({
        COST_CENTER: "",
        LOCATION: "TOTAL BOXES",
        PART: total_box.size,
        NAME: "",
        DESC: "",
        MAKE: "",
        UNIT: "DATE",
        RATE: "",
        CLOSING_QUANTITY: reqData.date,
        AMOUNT_LC: "",
        AMOUNT_FC: "",
        MIN_NO: "",
        LAST_IN: "",
        LAST_OUT: "",
      });

      // Create Excel report (unchanged)
      const ReportHeader = xlsx.utils.json_to_sheet(
        [{ A: `${c_details[0].company_name}` }],
        { header: ["A"], skipHeader: true }
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

      // Add company details to sheet
      const companyInfo = [
        { A2: `${c_details[0].company_address}` },
        { A3: `${c_details[0].company_city} - ${c_details[0].company_pin_code}` },
        { A4: `GST Registration : ${c_details[0].company_gst_no}` },
        { A5: `R1 REPORT - BOX WISE REPORT` },
        { A6: `Requested Date : ${moment(new Date()).format("DD-MM-YYYY HH:mm:ss")}` },
        { A7: `Generated By : ${c_details[0].user_name}` },
      ];

      companyInfo.forEach((info, index) => {
        xlsx.utils.sheet_add_json(ReportHeader, [info], {
          skipHeader: true,
          origin: `A${index + 2}`,
        });
      });

      // Add headers
      xlsx.utils.sheet_add_json(ReportHeader, [{
        A9: "COST_CENTER", B9: "LOCATION", C9: "PART", D9: "NAME", E9: "DESC",
        F9: "MAKE", G9: "UNIT", H9: "RATE", I9: "CLOSING_QUANTITY", J9: "AMOUNT_LC",
        K9: "AMOUNT_FC", L9: "MIN_NO", M9: "LAST_IN", N9: "LAST_OUT",
      }], { skipHeader: true, origin: "A9" });

      // Add data
      xlsx.utils.sheet_add_json(ReportHeader, finalResult, { skipHeader: true, origin: "A10" });

      const workbook = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(workbook, ReportHeader, "Details");
      xlsx.writeFile(workbook, fileName);

      // Send email
      let attachment = [{
        filename: fileName,
        content: fs.readFileSync(fileName),
      }];

      await sendMail(
        userEmail,
        "",
        "R1 Report [File Ready for download] Ref:" + randomNumber(),
        htmlTemplate(user[0].user_name, new Date(), "R1", "https://socket.mscapi.live/" + fileName),
        attachment
      );

      // Update request status
      await vansOtherDB.query(
        "UPDATE user_files_req SET status = :status WHERE user_id = :user_id AND module_name = :module_name AND req_code = :req_code AND req_date = :date",
        {
          replacements: {
            status: "complete",
            user_id: user_id,
            module_name: "VANS",
            req_code: "R1VANS",
            date: reqData.date ? reqData.date : new Date(),
          },
        }
      );
    });
  } catch (error) {
    socket.emit("errorMs", error.stack);
  }
};
