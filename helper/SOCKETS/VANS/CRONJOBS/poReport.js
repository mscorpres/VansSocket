const { vansDB } = require("../../../../config/db/connection");
const xlsx = require("xlsx");
const { sendMail, randomNumber } = require("../../../helper");
const moment = require("moment");
const { htmlTemplate } = require("../EmailTemplate/fileDownload");
const fs = require("fs");

exports.sendPendingPOReport = async function () {
  console.log(`Starting sendPendingPOReport at ${moment().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss")}`);
  try {
    const ReportDate = moment(new Date()).format("YYYY-MM-DD");
    let fileName = `files/excel/PENDING_PO_ALL${Math.floor(Math.random() * (999 - 100 + 1)) + 100}.csv`;

    console.log(`Generating pending PO report for date: ${ReportDate}, file: ${fileName}`);

    // Ensure the directory exists
    const dir = "files/excel";
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`Created directory: ${dir}`);
    }

    // Test database connection
    try {
      await vansDB.query("SELECT 1");
      console.log("Database connection successful");
    } catch (dbError) {
      throw new Error(`Database connection failed: ${dbError.message}`);
    }

    let finalResult = [];

    // Fetch pending POs for the current day using MariaDB syntax
    const query = `
  SELECT 
    *, 
    branches.branch_name, 
    COALESCE(SUM(\`po_purchase_req\`.\`po_order_qty\`), 0) AS totalReq_Qty, 
    COALESCE(SUM(\`po_purchase_req\`.\`po_inward_qty\`), 0) AS Inward 
  FROM \`po_purchase_req\` 
  LEFT JOIN \`components\` ON \`po_purchase_req\`.\`po_part_no\` = \`components\`.\`component_key\` 
  LEFT JOIN \`units\` ON \`units\`.\`units_id\` = \`components\`.\`c_uom\` 
  LEFT JOIN \`admin_login\` ON \`admin_login\`.\`CustID\` = \`po_purchase_req\`.\`po_insert_by\` 
  LEFT JOIN \`cost_center\` ON \`po_purchase_req\`.\`po_cost_center\` = \`cost_center\`.\`cost_center_key\` 
  LEFT JOIN \`branches\` ON \`branches\`.\`branch_code\` = \`po_purchase_req\`.\`company_branch\` 
  LEFT JOIN \`ims_currency\` ON \`ims_currency\`.\`currency_id\` = \`po_purchase_req\`.\`po_currency\` 
  WHERE \`components\`.\`c_type\` = 'R'
  AND \`po_purchase_req\`.\`po_status\` = 'A'
  AND \`po_purchase_req\`.\`po_status\` != 'C'
  GROUP BY \`po_purchase_req\`.\`po_part_no\`, \`po_purchase_req\`.\`po_transaction\` 
  HAVING (SUM(\`po_purchase_req\`.\`po_order_qty\`) - SUM(\`po_purchase_req\`.\`po_inward_qty\`)) > 0
  ORDER BY \`po_purchase_req\`.\`ID\` DESC
`;

    let stmt = await vansDB.query(query, {
      type: vansDB.QueryTypes.SELECT,
    });
    console.log(`Fetched ${stmt.length} records from po_purchase_req`);
    if (stmt.length === 0) {
      console.log(`No records found for date ${ReportDate}. Query used: ${query.replace(/:date/g, `'${ReportDate}'`)}`);
    } else {
      console.log(`Sample record: ${JSON.stringify(stmt[0], null, 2)}`);
    }

    for (let item of stmt) {
      let duedate = item.po_duedate === "" ? "--" : item.po_duedate;
      let cost_center = item.po_cost_center && item.po_cost_center !== "--" && item.po_cost_center !== "" ? `${item.cost_center_name || "N/A"} (${item.cost_center_short_name || "N/A"})` : "N/A";

      finalResult.push({
        REG_DATE: moment(item.po_full_date).tz("Asia/Kolkata").format("DD-MM-YYYY") || "N/A",
        PART_NO: item.c_part_no || "N/A",
        COMPONENT_NAME: item.c_name || "N/A",
        ORDERED_QTY: Number(item.po_order_qty) || 0,
        INWARD_QTY: Number(item.Inward) || 0,
        PENDING_QTY: Number(item.po_order_qty) - Number(item.Inward) || 0,
        VENDOR_NAME: item.po_vendor_name || "N/A",
        VENDOR_CODE: item.po_vendor_reg_id || "N/A",
        DUE_DATE: duedate,
        PO_ORDER_ID: item.po_transaction || "N/A",
        COST_CENTER: cost_center,
        BRANCH: item.branch_name || "N/A",
        MAKE: item.c_make || "N/A",
        DESCRIPTION: item.c_specification || "N/A",
        PO_RATE: item.po_order_rate || "N/A",
        CURRENCY: item.currency_symbol || "N/A",
      });
    }
    console.log(`Processed ${finalResult.length} rows for the report`);
    if (finalResult.length > 0) {
      console.log(`Sample processed row: ${JSON.stringify(finalResult[0], null, 2)}`);
    }

    const ReportHeader = xlsx.utils.json_to_sheet(
      [
        {
          A: "Pending PO Report",
        },
      ],
      {
        header: ["A"],
        skipHeader: true,
      },
    );

    ReportHeader["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 15 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 15 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 15 } },
    ];

    xlsx.utils.sheet_add_json(
      ReportHeader,
      [
        {
          A2: `ALL PENDING PO REPORT - As of ${moment(ReportDate).format("DD-MM-YYYY")}`,
        },
      ],
      {
        skipHeader: true,
        origin: "A2",
      },
    );

    xlsx.utils.sheet_add_json(
      ReportHeader,
      [
        {
          A3: `Generated Date: ${moment().tz("Asia/Kolkata").format("DD-MM-YYYY HH:mm:ss")}`,
        },
      ],
      {
        skipHeader: true,
        origin: "A3",
      },
    );

    xlsx.utils.sheet_add_json(
      ReportHeader,
      [
        {
          A5: "REG_DATE",
          B5: "PART_NO",
          C5: "COMPONENT_NAME",
          D5: "ORDERED_QTY",
          E5: "INWARD_QTY",
          F5: "PENDING_QTY",
          G5: "VENDOR_NAME",
          H5: "VENDOR_CODE",
          I5: "DUE_DATE",
          J5: "PO_ORDER_ID",
          K5: "COST_CENTER",
          L5: "BRANCH",
          M5: "MAKE",
          N5: "DESCRIPTION",
          O5: "PO_RATE",
          P5: "CURRENCY",
        },
      ],
      {
        skipHeader: true,
        origin: "A5",
      },
    );

    xlsx.utils.sheet_add_json(ReportHeader, finalResult, { skipHeader: true, origin: "A6" });
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, ReportHeader, "Details");
    try {
      xlsx.write(workbook, { bookType: "csv", type: "buffer" });
      xlsx.writeFile(workbook, fileName);
      console.log(`CSV file written to ${fileName}`);
      // Verify file content
      const fileContent = fs.readFileSync(fileName, "utf8");
      console.log(`CSV file content length: ${fileContent.length} characters`);
    } catch (fileError) {
      throw new Error(`Failed to write CSV file: ${fileError.message}`);
    }

    let attachment = [
      {
        filename: fileName,
        content: fs.readFileSync(fileName),
      },
    ];

    await sendMail(
      "aman.mandal@mscorpres.in",
      ["aman.mandal@mscorpres.in"],
      "Pending PO Report [File Ready for download] Ref:" + randomNumber(),
      htmlTemplate("User", new Date(), "Pending PO", "https://vans.ws.mscorpres.com" + fileName),
      attachment,
    );
    console.log(`Email sent to aman.mandal@mscorpres.in with attachment ${fileName}`);
  } catch (error) {
    console.error(`Error in sendPendingPOReport: ${error.message}`, error.stack);
  }
};

// const { vansDB } = require("../../../../config/db/connection");
// const xlsx = require("xlsx");
// const { sendMail, randomNumber } = require("../../../helper");
// const moment = require("moment");
// const { htmlTemplate } = require("../EmailTemplate/fileDownload");
// const fs = require("fs");

// const { vansDB } = require("../../../../config/db/connection");
// const xlsx = require("xlsx");
// const { sendMail, randomNumber } = require("../../../helper");
// const moment = require("moment");
// const { htmlTemplate } = require("../EmailTemplate/fileDownload");
// const fs = require("fs");

// exports.sendPendingPOReport = async function () {
//   console.log(`Starting sendPendingPOReport at ${moment().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss")}`);
//   try {
//     // Define date range
//     const startDate = "2024-04-01"; // Start of April 2024
//     const endDate = "2025-08-30"; // Hardcoded to August 30, 2025
//     let fileName = `files/excel/PENDING_PO_${Math.floor(Math.random() * (999 - 100 + 1)) + 100}.csv`;

//     console.log(`Generating pending PO report from ${startDate} to ${endDate}, file: ${fileName}`);

//     // Ensure the directory exists
//     const dir = "files/excel";
//     if (!fs.existsSync(dir)) {
//       fs.mkdirSync(dir, { recursive: true });
//       console.log(`Created directory: ${dir}`);
//     }

//     // Test database connection
//     try {
//       await vansDB.query("SELECT 1");
//       console.log("Database connection successful");
//     } catch (dbError) {
//       throw new Error(`Database connection failed: ${dbError.message}`);
//     }

//     let finalResult = [];

//     // Fetch pending POs for the date range using MariaDB syntax
//     const query = `
//       SELECT
//         *,
//         branches.branch_name,
//         COALESCE(SUM(\`po_purchase_req\`.\`po_order_qty\`), 0) AS totalReq_Qty,
//         COALESCE(SUM(\`po_purchase_req\`.\`po_inward_qty\`), 0) AS Inward
//       FROM \`po_purchase_req\`
//       LEFT JOIN \`components\` ON \`po_purchase_req\`.\`po_part_no\` = \`components\`.\`component_key\`
//       LEFT JOIN \`units\` ON \`units\`.\`units_id\` = \`components\`.\`c_uom\`
//       LEFT JOIN \`admin_login\` ON \`admin_login\`.\`CustID\` = \`po_purchase_req\`.\`po_insert_by\`
//       LEFT JOIN \`cost_center\` ON \`po_purchase_req\`.\`po_cost_center\` = \`cost_center\`.\`cost_center_key\`
//       LEFT JOIN \`branches\` ON \`branches\`.\`branch_code\` = \`po_purchase_req\`.\`company_branch\`
//       LEFT JOIN \`ims_currency\` ON \`ims_currency\`.\`currency_id\` = \`po_purchase_req\`.\`po_currency\`
//       WHERE \`components\`.\`c_type\` = 'R'
//       AND (\`po_purchase_req\`.\`po_status\` = 'A' OR \`po_purchase_req\`.\`po_inward_qty\` != '0')
//       AND DATE_FORMAT(\`po_purchase_req\`.\`po_full_date\`, '%Y-%m-%d') BETWEEN :startDate AND :endDate
//       GROUP BY \`po_purchase_req\`.\`po_part_no\`, \`po_purchase_req\`.\`po_transaction\`
//       HAVING (SUM(\`po_purchase_req\`.\`po_order_qty\`) - SUM(\`po_purchase_req\`.\`po_inward_qty\`)) > 0
//       ORDER BY \`po_purchase_req\`.\`ID\` DESC
//     `;
//     let stmt = await vansDB.query(query, {
//       replacements: { startDate, endDate },
//       type: vansDB.QueryTypes.SELECT,
//     });
//     console.log(`Fetched ${stmt.length} records from po_purchase_req`);
//     if (stmt.length === 0) {
//       console.log(`No records found for date range ${startDate} to ${endDate} with pending quantity > 0. Query used: ${query.replace(/:startDate/g, `'${startDate}'`).replace(/:endDate/g, `'${endDate}'`)}`);
//     } else {
//       console.log(`Sample record: ${JSON.stringify(stmt[0], null, 2)}`);
//     }

//     for (let item of stmt) {
//       let duedate = item.po_duedate === "" ? "--" : item.po_duedate;
//       let cost_center =
//         item.po_cost_center && item.po_cost_center !== "--" && item.po_cost_center !== ""
//           ? `${item.cost_center_name || "N/A"} (${item.cost_center_short_name || "N/A"})`
//           : "N/A";

//       const pendingQty = Number(item.po_order_qty) - Number(item.Inward);
//       finalResult.push({
//         REG_DATE: moment(item.po_full_date).tz("Asia/Kolkata").format("DD-MM-YYYY") || "N/A",
//         PART_NO: item.c_part_no || "N/A",
//         COMPONENT_NAME: item.c_name || "N/A",
//         ORDERED_QTY: Number(item.po_order_qty) || 0,
//         INWARD_QTY: Number(item.Inward) || 0,
//         PENDING_QTY: pendingQty || 0,
//         VENDOR_NAME: item.po_vendor_name || "N/A",
//         VENDOR_CODE: item.po_vendor_reg_id || "N/A",
//         DUE_DATE: duedate,
//         PO_ORDER_ID: item.po_transaction || "N/A",
//         COST_CENTER: cost_center,
//         BRANCH: item.branch_name || "N/A",
//         MAKE: item.c_make || "N/A",
//         DESCRIPTION: item.c_specification || "N/A",
//         PO_RATE: item.po_order_rate || "N/A",
//         CURRENCY: item.currency_symbol || "N/A",
//       });
//     }
//     console.log(`Processed ${finalResult.length} rows for the report`);
//     if (finalResult.length > 0) {
//       console.log(`Sample processed row: ${JSON.stringify(finalResult[0], null, 2)}`);
//     }

//     const ReportHeader = xlsx.utils.json_to_sheet(
//       [
//         {
//           A: "Pending PO Report",
//         },
//       ],
//       {
//         header: ["A"],
//         skipHeader: true,
//       }
//     );

//     ReportHeader["!merges"] = [
//       { s: { r: 0, c: 0 }, e: { r: 0, c: 15 } },
//       { s: { r: 1, c: 0 }, e: { r: 1, c: 15 } },
//       { s: { r: 2, c: 0 }, e: { r: 2, c: 15 } },
//     ];

//     xlsx.utils.sheet_add_json(
//       ReportHeader,
//       [
//         {
//           A2: `PENDING PO REPORT - ${moment(startDate).format("DD-MM-YYYY")} to ${moment(endDate).format("DD-MM-YYYY")}`,
//         },
//       ],
//       {
//         skipHeader: true,
//         origin: "A2",
//       }
//     );

//     xlsx.utils.sheet_add_json(
//       ReportHeader,
//       [
//         {
//           A3: `Generated Date: ${moment().tz("Asia/Kolkata").format("DD-MM-YYYY HH:mm:ss")}`,
//         },
//       ],
//       {
//         skipHeader: true,
//         origin: "A3",
//       }
//     );

//     xlsx.utils.sheet_add_json(
//       ReportHeader,
//       [
//         {
//           A5: "REG_DATE",
//           B5: "PART_NO",
//           C5: "COMPONENT_NAME",
//           D5: "ORDERED_QTY",
//           E5: "INWARD_QTY",
//           F5: "PENDING_QTY",
//           G5: "VENDOR_NAME",
//           H5: "VENDOR_CODE",
//           I5: "DUE_DATE",
//           J5: "PO_ORDER_ID",
//           K5: "COST_CENTER",
//           L5: "BRANCH",
//           M5: "MAKE",
//           N5: "DESCRIPTION",
//           O5: "PO_RATE",
//           P5: "CURRENCY",
//         },
//       ],
//       {
//         skipHeader: true,
//         origin: "A5",
//       }
//     );

//     xlsx.utils.sheet_add_json(ReportHeader, finalResult, { skipHeader: true, origin: "A6" });
//     const workbook = xlsx.utils.book_new();
//     xlsx.utils.book_append_sheet(workbook, ReportHeader, "Details");
//     try {
//       xlsx.write(workbook, { bookType: "csv", type: "buffer" });
//       xlsx.writeFile(workbook, fileName);
//       console.log(`CSV file written to ${fileName}`);
//       // Verify file content
//       const fileContent = fs.readFileSync(fileName, "utf8");
//       console.log(`CSV file content length: ${fileContent.length} characters`);
//     } catch (fileError) {
//       throw new Error(`Failed to write CSV file: ${fileError.message}`);
//     }

//     let attachment = [
//       {
//         filename: fileName,
//         content: fs.readFileSync(fileName),
//       },
//     ];

//     await sendMail(
//       "aman.mandal@mscorpres.in",
//       "",
//       "Pending PO Report [File Ready for download] Ref:" + randomNumber(),
//       htmlTemplate("User", new Date(), "Pending PO", "https://https://vans.ws.mscorpres.com" + fileName),
//       attachment
//     );
//     console.log(`Email sent to aman.mandal@mscorpres.in with attachment ${fileName}`);
//   } catch (error) {
//     console.error(`Error in sendPendingPOReport: ${error.message}`, error.stack);
//   }
// };
