const { vansDB } = require("../../../../config/db/connection");
const xlsx = require("xlsx");
const { sendMail, randomNumber } = require("../../../helper");
const moment = require("moment");
const { htmlTemplate } = require("../EmailTemplate/fileDownload");
const fs = require("fs");

exports.sendDispatchedInvoicedReport = async function () {
  try {
    const ReportDate = moment(new Date()).subtract(1, 'days').format("YYYY-MM-DD");
    let fileName = `files/excel/DISPATCH_INVOICED_${Math.floor(Math.random() * (999 - 100 + 1)) + 100}.csv`;
    
    const dir = "files/excel";
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`Created directory: ${dir}`);
    }

    let finalResult = [];

    let stmt = await vansDB.query(
      `SELECT 
        tbl_shipment.*,
        tbl_salesOrder_invoice.so_inv_id,
        tbl_salesOrder_invoice.dispatch_doc_no,
        tbl_salesOrder_invoice.dispatch_through,
        tbl_salesOrder_invoice.transporterName,
        tbl_salesOrder_invoice.transporter_mode,
        tbl_salesOrder_invoice.vehicle_type,
        tbl_salesOrder_invoice.vehicle_no,
        tbl_salesOrder_invoice.so_inv_create_dt,
        tbl_salesOrder.po_number,
        tbl_salesOrder.so_bill_to_address1,
        tbl_salesOrder.so_bill_to_address2,
        tbl_salesOrder.so_ship_to_address1,
        tbl_salesOrder.so_ship_to_address2,
        tbl_salesOrder.so_ship_to_company,
        cost_center.cost_center_name,
        admin_login.user_name
      FROM tbl_shipment
      INNER JOIN tbl_salesOrder_invoice ON tbl_salesOrder_invoice.shipment_id = tbl_shipment.shipment_id
      LEFT JOIN tbl_salesOrder ON tbl_salesOrder.so_id = tbl_shipment.so_id
      LEFT JOIN cost_center ON cost_center.cost_center_key = tbl_shipment.ship_cost_center
      LEFT JOIN admin_login ON admin_login.CustID = tbl_shipment.shipment_created_by
      WHERE tbl_shipment.ship_invoice_status = 'Y'
      AND tbl_shipment.ship_invoice_no!=''
      AND DATE_FORMAT(tbl_salesOrder_invoice.so_inv_create_dt, '%Y-%m-%d') = :date
      ORDER BY tbl_shipment.ship_invoice_no, tbl_shipment.shipment_id`,
      {
        replacements: { date: ReportDate },
        type: vansDB.QueryTypes.SELECT,
      }
    );
    console.log(`Fetched ${stmt.length} invoiced shipments`);

    for (let shipment of stmt) {
      let material_details = await vansDB.query(
        `SELECT 
          rm_location.*,
          components.c_name,
          components.c_part_no,
          components.c_specification
        FROM rm_location
        LEFT JOIN components ON components.component_key = rm_location.components_id
        WHERE rm_location.trans_type = 'ISSUE'
        AND rm_location.out_transaction_id = :pickslip_no
        ORDER BY rm_location.components_id`,
        {
          replacements: { pickslip_no: shipment.pickslip_id },
          type: vansDB.QueryTypes.SELECT,
        }
      );

      // Group by component and sum quantities
      let componentMap = new Map();
      
      for (let material of material_details) {
        let key = material.components_id;
        if (!componentMap.has(key)) {
          componentMap.set(key, {
            c_part_no: material.c_part_no,
            c_name: material.c_name,
            c_specification: material.c_specification,
            total_qty: 0,
            locations: []
          });
        }
        let component = componentMap.get(key);
        component.total_qty += Number(material.qty);
        if (!component.locations.includes(material.loc_out)) {
          component.locations.push(material.loc_out);
        }
      }

      // Add one row per component with total quantity
      for (let [componentId, component] of componentMap) {
        finalResult.push({
          DATETIME: shipment.so_inv_create_dt 
            ? moment(shipment.so_inv_create_dt).format("DD-MM-YYYY HH:mm:ss") 
            : "N/A",
          PO_NUMBER: shipment.po_number || "N/A",
          INVOICE_NO: shipment.ship_invoice_no || "N/A",
          BILL_TO: `${shipment.so_bill_to_address1 || ""} ${shipment.so_bill_to_address2 || ""}`.trim() || "N/A",
          SHIP_TO: `${shipment.so_ship_to_company || ""} ${shipment.so_ship_to_address1 || ""} ${shipment.so_ship_to_address2 || ""}`.trim() || "N/A",
          PARTCODE: component.c_part_no || "N/A",
          PART_NAME: component.c_name || "N/A",
          DESCRIPTION: component.c_specification || "N/A",
          QUANTITY: component.total_qty,
          DOCKET_NUMBER: shipment.dispatch_doc_no || "N/A",
          TRANSPORTER_DETAILS: shipment.transporterName 
            ? `${shipment.transporterName} | ${shipment.transporter_mode || 'N/A'} | ${shipment.vehicle_type || 'N/A'} | ${shipment.vehicle_no || 'N/A'}` 
            : "N/A",
          PICKSLIP_NO: shipment.pickslip_id || "N/A",
          COST_CENTER: shipment.cost_center_name || "N/A",
          LOCATION_OUT: component.locations.join(", ") || "N/A",
          PREPARED_BY: shipment.user_name || "N/A",
          SO_ID: shipment.so_id || "N/A",
          SHIPMENT_ID: shipment.shipment_id || "N/A",
        });
      }
    }

    console.log(`Processed ${finalResult.length} rows for the invoiced report`);

    const ReportHeader = xlsx.utils.json_to_sheet(
      [
        {
          A: "Dispatched & Invoiced Summary",
        },
      ],
      {
        header: ["A"],
        skipHeader: true,
      }
    );

    ReportHeader["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 16 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 16 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 16 } },
    ];

    xlsx.utils.sheet_add_json(
      ReportHeader,
      [
        {
          A2: `DISPATCHED & INVOICED SUMMARY - ${moment(ReportDate).format("DD-MM-YYYY")}`,
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
          A5: "DATETIME",
          B5: "PO_NUMBER",
          C5: "INVOICE_NO",
          D5: "BILL_TO",
          E5: "SHIP_TO",
          F5: "PARTCODE",
          G5: "PART_NAME",
          H5: "DESCRIPTION",
          I5: "QUANTITY",
          J5: "DOCKET_NUMBER",
          K5: "TRANSPORTER_DETAILS",
          L5: "PICKSLIP_NO",
          M5: "COST_CENTER",
          N5: "LOCATION_OUT",
          O5: "PREPARED_BY",
          P5: "SO_ID",
          Q5: "SHIPMENT_ID",
        },
      ],
      {
        skipHeader: true,
        origin: "A5",
      }
    );

    xlsx.utils.sheet_add_json(ReportHeader, finalResult, { skipHeader: true, origin: "A6" });
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, ReportHeader, "Invoiced Details");
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
      ["aman.mandal@mscorpres.in","neetu@vans-electronics.com","storevans@mscorpres.com","store@vans-electronics.com","namneet@silicon-india.com","accounts@vans-electronics.com","accounts@navsinternational.com"],
      "Dispatched & Invoiced Summary Report [File Ready for download] Ref:" + randomNumber(),
      htmlTemplate("User", new Date(), "Dispatched & Invoiced Summary", "https://socketv2.mscapi.live/" + fileName),
      attachment
    );
    console.log(`Email sent with attachment ${fileName}`);
  } catch (error) {
    console.error(`Error in sendDispatchedInvoicedReport: ${error.message}`, error.stack);
  }
};