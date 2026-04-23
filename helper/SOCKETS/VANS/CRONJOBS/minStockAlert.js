const { vansDB } = require("../../../../config/db/connection");
const xlsx = require("xlsx");
const { sendMail, randomNumber } = require("../../../helper");
const moment = require("moment");
const fs = require("fs");

exports.sendMinStockAlert = async function () {
  try {
    console.log("Executing query to fetch all components with notification enabled");
    const stmt = await vansDB.query(
      `SELECT 
        components.component_key, 
        components.c_part_no, 
        components.c_name,
        components.c_specification, 
        components.c_make, 
        components.c_closing_stock, 
        components.c_closing_stock_vans, 
        components.c_closing_stock_silicon, 
        components.closing_stock_time, 
        components.c_moq_qty, 
        components.c_soq_qty, 
        components.c_min_stock,
        components.c_max_stock,
        components.c_type,
        components.c_notification,
        units.units_name
      FROM components 
      LEFT JOIN units ON units.units_id = components.c_uom
      WHERE components.c_notification = 'Y'
      ORDER BY components.c_part_no ASC`,
      { type: vansDB.QueryTypes.SELECT },
    );

    console.log(`Query returned ${stmt.length} components with notification enabled`);

    if (stmt.length === 0) {
      console.log("No components found with notification enabled.");
      return;
    }

    let emailsSentCount = 0;
    let componentsProcessed = 0;

    //  Process each component individually and send separate emails
    console.log("Processing components and sending individual email alerts...");

    for (let i = 0; i < stmt.length; i++) {
      const component = stmt[i];
      componentsProcessed++;

      // Calculate total stock exactly
      const navStock = Number(component.c_closing_stock) || 0;
      const vansStock = Number(component.c_closing_stock_vans) || 0;
      const siliconStock = Number(component.c_closing_stock_silicon) || 0;
      const totalStock = navStock + vansStock + siliconStock;

      // Get minimum stock threshold
      const minStockFromDB = Number(component.c_min_stock) || 0;

      //Skip if c_min_stock is not set (0 or null)
      if (minStockFromDB <= 0) {
        console.log(`Skipping ${component.c_part_no} - No minimum stock set`);
        continue;
      }

      // Check if total stock is below c_min_stock threshold
      if (totalStock < minStockFromDB) {
        const shortage = minStockFromDB - totalStock;
        const shortagePercent = ((shortage / minStockFromDB) * 100).toFixed(2);

        console.log(`ALERT: ${component.c_part_no} | Total Stock: ${totalStock} < Min Stock: ${minStockFromDB}`);

        //Create individual Excel file for this component
        const fileName = `files/excel/MIN_STOCK_ALERT_${component.c_part_no}_${randomNumber()}.xlsx`;

        const dir = "files/excel";
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
          console.log(`Created directory: ${dir}`);
        }

        const componentData = {
          PART_CODE: component.c_part_no || "N/A",
          PART_NAME: component.c_name || "N/A",
          DESCRIPTION: component.c_specification || "N/A",
          MAKE: component.c_make || "N/A",
          UNIT: component.units_name || "N/A",
          TYPE: component.c_type || "N/A",
          TOTAL_STOCK: totalStock,
          NAV_STOCK: navStock,
          VANS_STOCK: vansStock,
          SILICON_STOCK: siliconStock,
          MIN_STOCK: minStockFromDB,
          MAX_STOCK: component.c_max_stock || "N/A",
          MOQ: component.c_moq_qty || "N/A",
          SOQ: component.c_soq_qty || "N/A",
          SHORTAGE_QTY: shortage,
          SHORTAGE_PERCENT: `${shortagePercent}%`,
          STATUS: totalStock <= 0 ? "OUT OF STOCK" : "BELOW MINIMUM",
        };

        //Create Excel report for individual component
        const ReportHeader = xlsx.utils.json_to_sheet([{ A: `⚠️ MINIMUM STOCK ALERT - ${component.c_part_no}` }], { header: ["A"], skipHeader: true });

        ReportHeader["!merges"] = [
          { s: { r: 0, c: 0 }, e: { r: 0, c: 16 } },
          { s: { r: 1, c: 0 }, e: { r: 1, c: 16 } },
        ];

        xlsx.utils.sheet_add_json(
          ReportHeader,
          [
            {
              A: `Generated: ${moment().format("DD-MM-YYYY HH:mm:ss")} | Component: ${component.c_part_no}`,
            },
          ],
          { skipHeader: true, origin: "A2" },
        );

        xlsx.utils.sheet_add_json(
          ReportHeader,
          [
            {
              A: "PART_CODE",
              B: "PART_NAME",
              C: "DESCRIPTION",
              D: "MAKE",
              E: "UNIT",
              F: "TYPE",
              G: "TOTAL_STOCK",
              H: "NAV_STOCK",
              I: "VANS_STOCK",
              J: "SILICON_STOCK",
              K: "MIN_STOCK",
              L: "MAX_STOCK",
              M: "MOQ",
              N: "SOQ",
              O: "SHORTAGE_QTY",
              P: "SHORTAGE_%",
              Q: "STATUS",
            },
          ],
          { skipHeader: true, origin: "A4" },
        );

        xlsx.utils.sheet_add_json(ReportHeader, [componentData], {
          skipHeader: true,
          origin: "A5",
        });

        ReportHeader["!cols"] = [
          { wch: 15 }, // PART_CODE
          { wch: 30 }, // PART_NAME
          { wch: 35 }, // DESCRIPTION
          { wch: 15 }, // MAKE
          { wch: 10 }, // UNIT
          { wch: 10 }, // TYPE
          { wch: 15 }, // TOTAL_STOCK
          { wch: 12 }, // NAV_STOCK
          { wch: 12 }, // VANS_STOCK
          { wch: 15 }, // SILICON_STOCK
          { wch: 12 }, // MIN_STOCK
          { wch: 12 }, // MAX_STOCK
          { wch: 10 }, // MOQ
          { wch: 10 }, // SOQ
          { wch: 15 }, // SHORTAGE_QTY
          { wch: 12 }, // SHORTAGE_%
          { wch: 18 }, // STATUS
        ];

        const workbook = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(workbook, ReportHeader, "Min Stock Alert");
        xlsx.writeFile(workbook, fileName);
        console.log(`Excel file created: ${fileName}`);

        const attachment = [
          {
            filename: `MIN_STOCK_ALERT_${component.c_part_no}_${moment().format("DDMMYYYY_HHmmss")}.xlsx`,
            content: fs.readFileSync(fileName),
          },
        ];

        const alertHtml = `
          <html>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
              <div style="max-width: 700px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
                <div style="background-color: #ff6b6b; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
                  <h2 style="margin: 0;">⚠️ MINIMUM STOCK ALERT</h2>
                  <h3 style="margin: 10px 0 0 0;">${component.c_part_no}</h3>
                </div>
                <div style="background-color: white; padding: 25px; border-radius: 0 0 8px 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                  <p style="font-size: 16px; margin-bottom: 15px;">
                    <strong>Alert Generated:</strong> ${moment().format("DD-MM-YYYY HH:mm:ss")}
                  </p>
                  
                  <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0;">
                    <p style="margin: 0; font-size: 18px; font-weight: bold; color: #856404;">
                      ${componentData.STATUS}
                    </p>
                  </div>

                  <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                    <tr style="background-color: #f8f9fa;">
                      <td style="padding: 12px; border: 1px solid #dee2e6; font-weight: bold;">Part Code:</td>
                      <td style="padding: 12px; border: 1px solid #dee2e6;">${componentData.PART_CODE}</td>
                    </tr>
                    <tr>
                      <td style="padding: 12px; border: 1px solid #dee2e6; font-weight: bold;">Part Name:</td>
                      <td style="padding: 12px; border: 1px solid #dee2e6;">${componentData.PART_NAME}</td>
                    </tr>
                    <tr style="background-color: #f8f9fa;">
                      <td style="padding: 12px; border: 1px solid #dee2e6; font-weight: bold;">Make:</td>
                      <td style="padding: 12px; border: 1px solid #dee2e6;">${componentData.MAKE}</td>
                    </tr>
                    <tr>
                      <td style="padding: 12px; border: 1px solid #dee2e6; font-weight: bold;">Unit:</td>
                      <td style="padding: 12px; border: 1px solid #dee2e6;">${componentData.UNIT}</td>
                    </tr>
                    <tr style="background-color: #fff3cd;">
                      <td style="padding: 12px; border: 1px solid #dee2e6; font-weight: bold;">Total Stock:</td>
                      <td style="padding: 12px; border: 1px solid #dee2e6; font-weight: bold; color: #d63031;">${componentData.TOTAL_STOCK}</td>
                    </tr>
                    <tr>
                      <td style="padding: 12px; border: 1px solid #dee2e6; font-weight: bold;">Minimum Stock:</td>
                      <td style="padding: 12px; border: 1px solid #dee2e6; font-weight: bold;">${componentData.MIN_STOCK}</td>
                    </tr>
                    <tr style="background-color: #ffebee;">
                      <td style="padding: 12px; border: 1px solid #dee2e6; font-weight: bold;">Shortage:</td>
                      <td style="padding: 12px; border: 1px solid #dee2e6; font-weight: bold; color: #c0392b;">${componentData.SHORTAGE_QTY} (${componentData.SHORTAGE_PERCENT})</td>
                    </tr>
                  </table>

                  <div style="background-color: #e8f4f8; padding: 15px; border-radius: 5px; margin-top: 20px;">
                    <p style="margin: 0; font-weight: bold; margin-bottom: 10px;">Stock Breakdown:</p>
                    <p style="margin: 5px 0;">NAV Stock: ${componentData.NAV_STOCK}</p>
                    <p style="margin: 5px 0;">VANS Stock: ${componentData.VANS_STOCK}</p>
                    <p style="margin: 5px 0;">Silicon Stock: ${componentData.SILICON_STOCK}</p>
                  </div>

                  <p style="margin-top: 20px;">
                    The attached Excel report contains detailed information about this component.
                  </p>
                  
                  <p style="color: #666; font-size: 14px; margin-top: 25px; padding-top: 15px; border-top: 1px solid #ddd;">
                    <strong>Note:</strong> Total Stock = NAV Stock + VANS Stock + Silicon Stock<br>
                    This alert was sent because notification is enabled for this component.
                  </p>
                </div>
              </div>
            </body>
          </html>
        `;

        try {
          await sendMail(
            "sales@vans-electronics.com",
            ["aman.mandal@mscorpres.in", "neetu@vans-electronics.com", "dispatch@vans-electronics.com", "store@vans-electronics.com", "namneet@silicon-india.com"],
            `STOCK ALERT: ${component.c_part_no} - Below Minimum - ${moment().format("DD-MM-YYYY")}`,
            alertHtml,
            attachment,
          );

          emailsSentCount++;
          console.log(`✓ Email sent successfully for ${component.c_part_no} (${emailsSentCount}/${componentsProcessed})`);
        } catch (emailError) {
          console.error(`✗ Failed to send email for ${component.c_part_no}:`, emailError.message);
        }

        setTimeout(() => {
          if (fs.existsSync(fileName)) {
            fs.unlinkSync(fileName);
            console.log(`✓ File cleaned up: ${fileName}`);
          }
        }, 5000);

        //  Add small delay between emails to avoid overwhelming mail server
        if (i < stmt.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      } else {
        console.log(`OK: ${component.c_part_no} | Total Stock: ${totalStock} >= Min Stock: ${minStockFromDB}`);
      }
    }

    console.log(`\n=== Summary ===`);
    console.log(`Components Processed: ${componentsProcessed}`);
    console.log(`Emails Sent: ${emailsSentCount}`);
    console.log(`Completed at ${moment().format("YYYY-MM-DD HH:mm:ss")}`);
  } catch (error) {
    console.error(`Error in sendMinStockAlert: ${error.message}`, error.stack);
  }
};
