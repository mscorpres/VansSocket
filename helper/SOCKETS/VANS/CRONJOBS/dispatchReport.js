const { vansDB } = require("../../../../config/db/connection");
const xlsx = require("xlsx");
const { sendMail, randomNumber } = require("../../../helper");
const moment = require("moment");
const { htmlTemplate } = require("../EmailTemplate/fileDownload");
const fs = require("fs");

exports.sendDispatchReport = async function () {
  console.log(`Starting sendDispatchReport at ${moment().format("YYYY-MM-DD HH:mm:ss")}`);
  try {
    const ReportDate = moment(new Date()).subtract(1, "days").format("YYYY-MM-DD");
    let fileName = `files/excel/DISPATCH${Math.floor(Math.random() * (999 - 100 + 1)) + 100}.csv`;

    console.log(`Generating dispatch report for YESTERDAY's date: ${ReportDate}, file: ${fileName}`);
    // Ensure the directory exists
    const dir = "files/excel";
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`Created directory: ${dir}`);
    }

    let finalResult = [];

    // Fetch all ISSUE transactions for the current day
    let stmt = await vansDB.query(
      `SELECT 
        rm_location.*, 
        cost_center_name, 
        COALESCE(clients.ccode, rm_location.customer) AS ccode, 
        COALESCE(clients.cname, rm_location.customer) AS cname, 
        admin_login.user_name,
        tbl_shipment.so_id, 
        tbl_shipment.shipment_id 
      FROM rm_location 
      LEFT JOIN cost_center ON cost_center.cost_center_key = rm_location.cost_center  
      LEFT JOIN clients ON clients.ccode = rm_location.customer 
      LEFT JOIN admin_login ON admin_login.CustID = rm_location.insert_by 
      LEFT JOIN tbl_shipment ON tbl_shipment.pickslip_id = rm_location.out_transaction_id 
      WHERE rm_location.trans_type = 'ISSUE' 
      AND DATE_FORMAT(rm_location.insert_date, '%Y-%m-%d') = :date
      GROUP BY rm_location.out_transaction_id, rm_location.components_id`,
      {
        replacements: { date: ReportDate },
        type: vansDB.QueryTypes.SELECT,
      },
    );
    console.log(`Fetched ${stmt.length} records from rm_location`);

    for (let item of stmt) {
      let stmt_box_qty = await vansDB.query(
        `SELECT 
          rm_location.*, 
          components.c_name, 
          components.c_part_no, 
          components.c_specification 
        FROM rm_location 
        LEFT JOIN components ON components.component_key = rm_location.components_id  
        WHERE rm_location.trans_type = 'ISSUE' 
        AND rm_location.out_transaction_id = :pickslip_no 
        AND rm_location.components_id = :comp`,
        {
          replacements: { pickslip_no: item.out_transaction_id, comp: item.components_id },
          type: vansDB.QueryTypes.SELECT,
        },
      );

      let total_part_qty = 0;
      for (let box of stmt_box_qty) {
        total_part_qty += Number(box.qty);
        finalResult.push({
          DATETIME: moment(item.insert_date, "YYYY-MM-DD HH:mm:ss").format("DD-MM-YYYY HH:mm:ss"),
          PICKSLIP_NO: item.out_transaction_id || "N/A",
          CUSTOMER: `${item.cname} (${item.ccode})` || "N/A",
          PARTCODE: box.c_part_no || "N/A",
          PART_NAME: box.c_name || "N/A",
          DESCRIPTION: box.c_specification || "N/A",
          COST_CENTER: item.cost_center_name || "N/A",
          LOCATION_OUT: box.loc_out || "N/A",
          QUANTITY: Number(box.qty),
          PREPARED_BY: item.user_name || "N/A",
          SO_ID: item.so_id || "N/A",
          SHIPMENT_ID: item.shipment_id || "N/A",
        });
      }
      // Add total quantity row for each pickslip_no and component
      finalResult.push({
        DATETIME: "",
        PICKSLIP_NO: item.out_transaction_id || "N/A",
        CUSTOMER: "",
        PARTCODE: "Total",
        PART_NAME: "",
        DESCRIPTION: "",
        COST_CENTER: "",
        LOCATION_OUT: "",
        QUANTITY: total_part_qty,
        PREPARED_BY: "",
        SO_ID: "",
        SHIPMENT_ID: "",
      });
    }
    console.log(`Processed ${finalResult.length} rows for the report`);

    const ReportHeader = xlsx.utils.json_to_sheet(
      [
        {
          A: "Dispatch Report",
        },
      ],
      {
        header: ["A"],
        skipHeader: true,
      },
    );

    ReportHeader["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 10 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 10 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 10 } },
    ];

    xlsx.utils.sheet_add_json(
      ReportHeader,
      [
        {
          A2: `DISPATCH REPORT - ${moment(ReportDate).format("DD-MM-YYYY")}`,
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
          A3: `Generated Date: ${moment(new Date()).format("DD-MM-YYYY HH:mm:ss")}`,
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
          A5: "DATETIME",
          B5: "PICKSLIP_NO",
          C5: "CUSTOMER",
          D5: "PARTCODE",
          E5: "PART_NAME",
          F5: "DESCRIPTION",
          G5: "COST_CENTER",
          H5: "LOCATION_OUT",
          I5: "QUANTITY",
          J5: "PREPARED_BY",
          K5: "SO_ID",
          L5: "SHIPMENT_ID",
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
    xlsx.write(workbook, { bookType: "csv", type: "buffer" });
    xlsx.writeFile(workbook, fileName);
    console.log(`CSV file written to ${fileName}`);

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
      "Dispatch Report [File Ready for download] Ref:" + randomNumber(),
      htmlTemplate("User", new Date(), "Ready for Dispatch", "https://vans.ws.mscorpres.com" + fileName),
      attachment,
    );
    console.log(`Email sent to aman.mandal@mscorpres.in with attachment ${fileName}`);
  } catch (error) {
    console.error(`Error in sendDispatchReport: ${error.message}`, error.stack);
  }
};
