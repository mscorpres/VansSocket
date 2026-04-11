const { vansDB } = require("../../../../config/db/connection");
const xlsx = require("xlsx");
const { sendMail, randomNumber } = require("../../../helper");
const moment = require("moment");
const { htmlTemplate } = require("../EmailTemplate/fileDownload");
const fs = require("fs");

exports.sendIwardReport = async function () {
  console.log(`Starting sendIwardReport at ${moment().format("YYYY-MM-DD HH:mm:ss")}`);
  try {
    const ReportDate = moment(new Date()).subtract(1, 'days').format("YYYY-MM-DD");
    let fileName = `files/excel/INWARD${Math.floor(Math.random() * (999 - 100 + 1)) + 100}.csv`;

    console.log(`Generating report for date: ${ReportDate}, file: ${fileName}`);

    
    const dir = "files/excel";
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`Created directory: ${dir}`);
    }

    let finalResult = [];

    let stmt = await vansDB.query(
      "SELECT *,`cost_center`.`cost_center_name`, `rm_transaction`.`insert_date` AS `inward_date` FROM `rm_transaction` LEFT JOIN `cost_center` ON `rm_transaction`.`cost_center` = `cost_center`.`cost_center_key` LEFT JOIN `admin_login` ON `rm_transaction`.`insert_by` = `admin_login`.`CustID` LEFT JOIN `components` ON `rm_transaction`.`components_id` = `components`.`component_key` LEFT JOIN `units` ON `components`.`c_uom` = `units`.`units_id` WHERE DATE_FORMAT( `rm_transaction`.`insert_date`, '%Y-%m-%d' ) = :date AND( `rm_transaction`.`trans_type` = 'INWARD' ) ORDER BY `rm_transaction`.`in_transaction_id` DESC",
      {
        replacements: { date: ReportDate },
        type: vansDB.QueryTypes.SELECT,
      }
    );
    console.log(`Fetched ${stmt.length} records from rm_transaction`);

    for (let item of stmt) {
      let stmt1 = await vansDB.query("SELECT * FROM `ven_basic_detail` WHERE `ven_register_id` = :vendorname", {
        replacements: { vendorname: item.in_vendor_name },
        type: vansDB.QueryTypes.SELECT,
      });

      let vendorname = "--";
      if (stmt1.length > 0) {
        vendorname = stmt1[0].ven_name;
      } else {
        vendorname = "N/A";
      }

      let invoice = "--";
      if (item.in_invoice_id !== "--") {
        invoice = item.in_invoice_id;
      } else {
        invoice = item.in_invoice_id;
      }

      finalResult.push({
        DATETIME: moment(item.inward_date, "YYYY-MM-DD HH:mm:ss").format("DD-MM-YYYY HH:mm:ss"),
        PARTCODE: item.c_part_no || "N/A",
        TRANSACTION: item.in_transaction_id || "N/A",
        PO_NUMBER: item.in_po_txn_id || "N/A",
        VENDORNAME: vendorname,
        INQTY: Number(item.qty) + Number(item.other_qty),
        INVOICE: invoice,
        INBY: item.user_name || "N/A",
        C_CENTER: item.cost_center_name || "N/A",
      });
    }
    console.log(`Processed ${finalResult.length} rows for the report`);

    const ReportHeader = xlsx.utils.json_to_sheet(
      [
        {
          A: "Inward Report",
        },
      ],
      {
        header: ["A"],
        skipHeader: true,
      }
    );

    ReportHeader["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 9 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 9 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 9 } },
    ];

    xlsx.utils.sheet_add_json(
      ReportHeader,
      [
        {
          A2: `INWARD REPORT - ${moment(ReportDate).format("DD-MM-YYYY")}`,
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
          A3: `Generated Date: ${moment(new Date()).format("DD-MM-YYYY HH:mm:ss")}`,
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
          A5: "MIN DATE",
          C5: "PARTCODE",
          D5: "TRANSACTION",
          E5: "PO_NUMBER",
          F5: "VENDORNAME",
          G5: "INQTY",
          H5: "INVOICE",
          I5: "INBY",
          J5: "C_CENTER",
        },
      ],
      {
        skipHeader: true,
        origin: "A5",
      }
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
      ["aman.mandal@mscorpres.in","neetu@vans-electronics.com","storevans@mscorpres.com","store@vans-electronics.com","purchase@vans-electronics.com"],
      "Inward Report [File Ready for download] Ref:" + randomNumber(),
      htmlTemplate("User", new Date(), "Inward", "https://socketv2.mscapi.live/" + fileName),
      attachment
    );
    console.log(`Email sent to sales@vans-electronics.com in with attachment ${fileName}`);
  } catch (error) {
    console.error(`Error in sendIwardReport: ${error.message}`, error.stack);
  }
};