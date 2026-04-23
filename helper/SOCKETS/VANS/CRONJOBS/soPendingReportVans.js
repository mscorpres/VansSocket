const { vansDB } = require("../../../../config/db/connection");
const xlsx = require("xlsx");
const { sendMail, randomNumber } = require("../../../helper");
const moment = require("moment");
const { htmlTemplate } = require("../EmailTemplate/fileDownload");
const fs = require("fs");

exports.sendSOPendingReport = async function () {
  console.log(`Starting sendSOPendingReport at ${moment().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss")}`);
  try {
    const ReportDate = moment(new Date()).format("YYYY-MM-DD");
    let fileName = `files/excel/SO_PENDING_ALL${Math.floor(Math.random() * (999 - 100 + 1)) + 100}.csv`;

    console.log(`Generating ALL SO pending report as of date: ${ReportDate}, file: ${fileName}`);

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

    // Fetch ALL pending SOs (removed date filter)
    const query = `
      SELECT 
        \`tbl_salesOrder\`.*,
        \`tbl_salesOrder_items\`.*,
        \`branches\`.\`branch_name\`,
        \`components\`.\`c_name\` AS component_name,
        \`components\`.\`c_part_no\` AS part_no,
        \`components\`.\`c_specification\` AS specification,
        \`units\`.\`units_name\` AS uom,
        COALESCE(SUM(\`tbl_salesOrder_items\`.\`qty\`), 0) AS total_qty,
        COALESCE(SUM(\`tbl_salesOrder_items\`.\`pending_qty\`), 0) AS total_pending_qty,
        \`admin_login\`.\`user_name\`,
        \`cost_center\`.\`cost_center_name\`,
        \`cost_center\`.\`cost_center_short_name\`,
        \`ims_currency\`.\`currency_symbol\`,
        \`ims_currency\`.\`currency_lable\`,
        \`clients\`.\`cname\`
      FROM \`tbl_salesOrder\`
      LEFT JOIN \`tbl_salesOrder_items\` ON \`tbl_salesOrder\`.\`so_id\` = \`tbl_salesOrder_items\`.\`so_id\`
      LEFT JOIN \`components\` ON \`tbl_salesOrder_items\`.\`item\` = \`components\`.\`component_key\`
      LEFT JOIN \`units\` ON \`components\`.\`c_uom\` = \`units\`.\`units_id\`
      LEFT JOIN \`branches\` ON \`branches\`.\`branch_code\` = \`tbl_salesOrder\`.\`so_bill_from_id\`
      LEFT JOIN \`admin_login\` ON \`admin_login\`.\`CustID\` = \`tbl_salesOrder\`.\`so_create_by\`
      LEFT JOIN \`cost_center\` ON \`tbl_salesOrder\`.\`so_costcenter\` = \`cost_center\`.\`cost_center_key\`
      LEFT JOIN \`ims_currency\` ON \`ims_currency\`.\`currency_id\` = \`tbl_salesOrder_items\`.\`currency\`
      LEFT JOIN \`clients\` ON \`tbl_salesOrder\`.\`so_cust_code\` = \`clients\`.\`ccode\`
      WHERE \`tbl_salesOrder\`.\`so_status\` = 'A' 
      AND \`tbl_salesOrder_items\`.\`pending_qty\` > 0
      GROUP BY \`tbl_salesOrder\`.\`so_id\`, \`tbl_salesOrder_items\`.\`ID\`
      ORDER BY \`tbl_salesOrder\`.\`so_create_dt\` DESC
    `;
    let stmt = await vansDB.query(query, {
      type: vansDB.QueryTypes.SELECT,
    });
    console.log(`Fetched ${stmt.length} records from tbl_salesOrder`);
    if (stmt.length === 0) {
      console.log(`No pending records found. Query used: ${query}`);
    } else {
      console.log(`Sample record: ${JSON.stringify(stmt[0], null, 2)}`);
    }

    for (let row of stmt) {
      let cost_center = row.cost_center_name && row.cost_center_short_name ? `${row.cost_center_name} (${row.cost_center_short_name})` : "N/A";

      finalResult.push({
        SO_ID: row.so_id || "N/A",
        CLIENT_NAME: row.cname || "N/A",
        BILL_TO_ADDRESS: `${row.so_bill_to_address1 || ""} ${row.so_bill_to_address2 || ""}`.trim() || "N/A",
        SHIP_TO_ADDRESS: `${row.so_ship_to_address1 || ""} ${row.so_ship_to_address2 || ""}`.trim() || "N/A",
        COMPONENT_NAME: row.component_name || "N/A",
        PART_NO: row.part_no || "--",
        SPECIFICATION: row.specification || "N/A",
        TOTAL_QTY: Number(row.total_qty) || 0,
        PENDING_QTY: Number(row.total_pending_qty) || 0,
        RATE: row.rate || "N/A",
        CURRENCY_SYMBOL: row.currency_symbol || "N/A",
        REG_DATE: moment(row.so_create_dt).tz("Asia/Kolkata").format("DD-MM-YYYY") || "N/A",
        CREATED_BY: row.user_name || "N/A",
        DUE_DATE: row.due_date || "--",
        PO_NUMBER: row.po_number || "--",
        PO_DATE: row.po_date || "--",
        COST_CENTER: cost_center,
        INVOICE_NO: row.so_invoice_no || "--",
        HSN_CODE: row.hsn_code || "--",
        GST_RATE: row.gst_rate || 0,
        REMARK: row.so_remark || "--",
      });
    }
    console.log(`Processed ${finalResult.length} rows for the report`);
    if (finalResult.length > 0) {
      console.log(`Sample processed row: ${JSON.stringify(finalResult[0], null, 2)}`);
    }

    const ReportHeader = xlsx.utils.json_to_sheet(
      [
        {
          A: "SO Pending Report",
        },
      ],
      {
        header: ["A"],
        skipHeader: true,
      },
    );

    ReportHeader["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 24 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 24 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 24 } },
    ];

    xlsx.utils.sheet_add_json(
      ReportHeader,
      [
        {
          A2: `ALL SO PENDING REPORT - As of ${moment(ReportDate).format("DD-MM-YYYY")}`,
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
          A5: "SO_ID",
          B5: "CLIENT_NAME",
          C5: "BILL_TO_ADDRESS",
          D5: "SHIP_TO_ADDRESS",
          E5: "COMPONENT_NAME",
          F5: "PART_NO",
          G5: "SPECIFICATION",
          H5: "TOTAL_QTY",
          I5: "PENDING_QTY",
          J5: "RATE",
          K5: "CURRENCY_SYMBOL",
          L5: "REG_DATE",
          M5: "CREATED_BY",
          N5: "DUE_DATE",
          O5: "PO_NUMBER",
          P5: "PO_DATE",
          Q5: "COST_CENTER",
          R5: "INVOICE_NO",
          S5: "HSN_CODE",
          T5: "GST_RATE",
          U5: "REMARK",
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
      "sales@vans-electronics.com",
      [
        "aman.mandal@mscorpres.in",
        "neetu@vans-electronics.com",
        "dispatch@vans-electronics.com",
        "store@vans-electronics.com",
        "namneet@silicon-india.com",
        "accounts@vans-electronics.com",
        "accounts@navsinternational.com",
      ],
      "SO Pending Report - All Pending [File Ready for download] Ref:" + randomNumber(),
      htmlTemplate("User", new Date(), "SO Pending (All)", "https://vans.ws.mscorpres.com" + fileName),
      attachment,
    );
    console.log(`Email sent with ALL pending SO report attachment ${fileName}`);
  } catch (error) {
    console.error(`Error in sendSOPendingReport: ${error.message}`, error.stack);
  }
};
