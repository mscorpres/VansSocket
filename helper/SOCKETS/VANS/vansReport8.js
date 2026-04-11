const { vansDB, vansOtherDB } = require("../../../config/db/connection");
const xlsx = require("xlsx");
const { sendMail, randomNumber } = require("../../helper");
const jwt = require("jsonwebtoken");
let fs = require("fs");
const moment = require("moment");
const { htmlTemplate } = require("./EmailTemplate/fileDownload");
const { verifyToken } = require("../../utils");
const { decode } = require("html-entities");

exports.outwardReport = async function (io, socket) {
  try {
    socket.on("outwardReportGenerate", async (data) => {
      const reqData = data;
      let fileName = "";
      token_res = await verifyToken(`${socket.handshake.auth.token}`);
      const user_id = token_res.crn_id;

      // Validate required fields - only support datewise for socket
      if (!reqData.wise || !reqData.data || reqData.wise !== "datewise") {
        socket.emit("errorMs", "Socket only supports datewise queries. Use wise: 'datewise' with date in DD-MM-YYYY format");
        return;
      }

      const reqCode = "OUTWARD_DATE";
      const reportLabel = "Outward Report - Date Wise (Up to Date)";

      // Check if file request already exists
      const check_data = await vansOtherDB.query(
        "SELECT * FROM `user_files_req` WHERE `user_id`= :uid AND `req_code` = :reqCode AND `status` = 'pending'", 
        {
          replacements: { uid: user_id, reqCode: reqCode },
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
        fileName = "files/excel/OUT" + (Math.floor(Math.random() * (999 - 100 + 1)) + 100) + ".xlsx";

        await vansOtherDB.query(
          "INSERT INTO `user_files_req` ( module_name , request_txt_label , req_code, req_date , user_id , msg_type , status , insert_date , other_data ) VALUES ( :module_name , :request_txt_label , :req_code , :req_date , :user_id , :msg_type , :status , :insert_date, :other_data )",
          {
            replacements: {
              module_name: "INVENTORY",
              request_txt_label: reportLabel,
              req_code: reqCode,
              user_id: user_id,
              req_date: moment(new Date()).format("YYYY-MM-DD"),
              msg_type: "file",
              status: "pending",
              insert_date: moment(new Date()).format("YYYY-MM-DD HH:mm:ss"),
              other_data: JSON.stringify({
                fileName: reportLabel,
                fileUrl: fileName,
                queryData: reqData,
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

      // Execute datewise query (up to specified date)
      const date = moment(reqData.data, "DD-MM-YYYY").format("YYYY-MM-DD");
      
      const sqlQuery = `
        SELECT 
          rm_location.*,
          cost_center.cost_center_name,
          COALESCE(clients.ccode, rm_location.customer) AS ccode,
          COALESCE(clients.cname, rm_location.customer) AS cname,
          admin_login.user_name,
          tbl_shipment.so_id,
          tbl_shipment.shipment_id,
          components.c_name,
          components.c_part_no,
          components.c_specification
        FROM rm_location
        LEFT JOIN cost_center ON cost_center.cost_center_key = rm_location.cost_center
        LEFT JOIN clients ON clients.ccode = rm_location.customer
        LEFT JOIN admin_login ON admin_login.CustID = rm_location.insert_by
        LEFT JOIN tbl_shipment ON tbl_shipment.pickslip_id = rm_location.out_transaction_id
        LEFT JOIN components ON components.component_key = rm_location.components_id
        WHERE rm_location.trans_type = 'ISSUE'
        AND DATE_FORMAT(rm_location.insert_date, '%Y-%m-%d') <= :date
        ORDER BY DATE(rm_location.insert_date) DESC, rm_location.out_transaction_id DESC`;

      const stmt = await vansDB.query(sqlQuery, {
        replacements: { date: date },
        type: vansDB.QueryTypes.SELECT,
      });

      // Process results - Group by date, then by pickslip, and add totals
      let finalResult = [];
      let dateGroups = {};

      // First, group all items by date, then by pickslip
      for (let item of stmt) {
        const dateKey = moment(item.insert_date, "YYYY-MM-DD HH:mm:ss").format("YYYY-MM-DD");
        const pickslipNo = item.out_transaction_id || "N/A";

        if (!dateGroups[dateKey]) {
          dateGroups[dateKey] = {
            pickslips: {},
            totalQty: 0
          };
        }

        if (!dateGroups[dateKey].pickslips[pickslipNo]) {
          dateGroups[dateKey].pickslips[pickslipNo] = {
            items: [],
            totalQty: 0
          };
        }

        const processedItem = {
          DATETIME: moment(item.insert_date, "YYYY-MM-DD HH:mm:ss").format("DD-MM-YYYY HH:mm:ss"),
          PICKSLIP_NO: pickslipNo,
          CUSTOMER: `${item.cname} (${item.ccode})` || "N/A",
          PARTCODE: item.c_part_no || "N/A",
          PART_NAME: decode(item.c_name || "N/A"),
          DESCRIPTION: decode(item.c_specification || "N/A"),
          COST_CENTER: item.cost_center_name || "N/A",
          LOCATION_OUT: item.loc_out || "N/A",
          QUANTITY: Number(item.qty || 0),
          PREPARED_BY: item.user_name || "N/A",
          SO_ID: item.so_id || "N/A",
          SHIPMENT_ID: item.shipment_id || "N/A",
        };

        dateGroups[dateKey].pickslips[pickslipNo].items.push(processedItem);
        dateGroups[dateKey].pickslips[pickslipNo].totalQty += Number(item.qty || 0);
        dateGroups[dateKey].totalQty += Number(item.qty || 0);
      }

      // Arrange the final result: items + total for each pickslip + total for each date
      for (let dateKey in dateGroups) {
        const dateGroup = dateGroups[dateKey];

        // Add date header
        finalResult.push({
          DATETIME: moment(dateKey, "YYYY-MM-DD").format("DD-MM-YYYY"),
          PICKSLIP_NO: "Date: " + moment(dateKey, "YYYY-MM-DD").format("DD-MM-YYYY"),
          CUSTOMER: "",
          PARTCODE: "",
          PART_NAME: "",
          DESCRIPTION: "",
          COST_CENTER: "",
          LOCATION_OUT: "",
          QUANTITY: "",
          PREPARED_BY: "",
          SO_ID: "",
          SHIPMENT_ID: "",
        });

        // Add items and totals for each pickslip within this date
        for (let pickslipNo in dateGroup.pickslips) {
          const group = dateGroup.pickslips[pickslipNo];
          finalResult.push(...group.items);

          // Add total row for this pickslip
          finalResult.push({
            DATETIME: "",
            PICKSLIP_NO: pickslipNo,
            CUSTOMER: "",
            PARTCODE: "Total",
            PART_NAME: "",
            DESCRIPTION: "",
            COST_CENTER: "",
            LOCATION_OUT: "",
            QUANTITY: group.totalQty,
            PREPARED_BY: "",
            SO_ID: "",
            SHIPMENT_ID: "",
          });
        }

        // Add total row for this date
        finalResult.push({
          DATETIME: "",
          PICKSLIP_NO: "Total for " + moment(dateKey, "YYYY-MM-DD").format("DD-MM-YYYY"),
          CUSTOMER: "",
          PARTCODE: "",
          PART_NAME: "",
          DESCRIPTION: "",
          COST_CENTER: "",
          LOCATION_OUT: "",
          QUANTITY: dateGroup.totalQty,
          PREPARED_BY: "",
          SO_ID: "",
          SHIPMENT_ID: "",
        });
      }

      if (finalResult.length === 0) {
        socket.emit("errorMs", "No data found for the specified criteria");
        return;
      }

      // Create Excel report
      const ReportHeader = xlsx.utils.json_to_sheet(
        [{ A: `${c_details[0].company_name}` }],
        { header: ["A"], skipHeader: true }
      );

      ReportHeader["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 11 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 11 } },
        { s: { r: 2, c: 0 }, e: { r: 2, c: 11 } },
        { s: { r: 3, c: 0 }, e: { r: 3, c: 11 } },
        { s: { r: 4, c: 0 }, e: { r: 4, c: 11 } },
        { s: { r: 5, c: 0 }, e: { r: 5, c: 11 } },
        { s: { r: 6, c: 0 }, e: { r: 6, c: 11 } },
      ];

      // Add company details to sheet
      const companyInfo = [
        { A2: `${c_details[0].company_address}` },
        { A3: `${c_details[0].company_city} - ${c_details[0].company_pin_code}` },
        { A4: `GST Registration : ${c_details[0].company_gst_no}` },
        { A5: reportLabel },
        { A6: `Generated Date : ${moment(new Date()).format("DD-MM-YYYY HH:mm:ss")}` },
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
        A9: "DATETIME", B9: "PICKSLIP_NO", C9: "CUSTOMER", D9: "PARTCODE", 
        E9: "PART_NAME", F9: "DESCRIPTION", G9: "COST_CENTER", H9: "LOCATION_OUT",
        I9: "QUANTITY", J9: "PREPARED_BY", K9: "SO_ID", L9: "SHIPMENT_ID",
      }], { skipHeader: true, origin: "A9" });

      // Add data
      xlsx.utils.sheet_add_json(ReportHeader, finalResult, { skipHeader: true, origin: "A10" });

      const workbook = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(workbook, ReportHeader, "Outward Report");
      xlsx.writeFile(workbook, fileName);

      // Send email
      let attachment = [{
        filename: fileName,
        content: fs.readFileSync(fileName),
      }];

      await sendMail(
        userEmail,
        "",
        `${reportLabel} [File Ready for download] Ref:` + randomNumber(),
        htmlTemplate(user[0].user_name, new Date(), "Outward Report", "https://socket.mscapi.live/" + fileName),
        attachment
      );

      // Update request status
      await vansOtherDB.query(
        "UPDATE user_files_req SET status = :status WHERE user_id = :user_id AND req_code = :req_code",
        {
          replacements: {
            status: "complete",
            user_id: user_id,
            req_code: reqCode,
          },
        }
      );

      socket.emit("reportGenerated", {
        success: true,
        message: "Report generated successfully and sent to your email",
        fileName: fileName
      });

    });
  } catch (error) {
    socket.emit("errorMs", error.stack);
  }
};