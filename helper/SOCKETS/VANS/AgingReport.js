const { vansDB, vansOtherDB } = require("../../../config/db/connection");
const xlsx = require("xlsx");
const { sendMail } = require("../../helper");
const helper = require("../../helper");
const jwt = require("jsonwebtoken");
let fs = require("fs");
const moment = require("moment");
const { htmlTemplate } = require("./EmailTemplate/fileDownload");
const { error } = require("console");

exports.componentAgingStock = async function (io, socket) {
  try {
    socket.on("allComponentAgingStock", async (data) => {
      const [day, month, year] = data.date.split("-");
      const date = `${year}-${month}-${day}`;
      const currentDate = moment(date);

      let fileName = "";
      token_res = await verifyToken(`${socket.handshake.auth.token}`);
      let user_id = token_res.crn_id;

      let check_data = await vansOtherDB.query("SELECT * FROM `user_files_req` WHERE `user_id`= :uid AND `req_code` = 'R9VANS' AND `status` = 'pending'", {
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
        fileName = "files/excel/R9" + (Math.floor(Math.random() * (999 - 100 + 1)) + 100) + ".xlsx";

        let stmt_insert = await vansOtherDB.query(
          "INSERT INTO `user_files_req` ( module_name , request_txt_label , req_date,req_code , 	user_id , msg_type , 	status , insert_date , other_data ) VALUES ( :module_name , :request_txt_label , :req_date,:req_code , :user_id , :msg_type , :status , :insert_date, :other_data ) ",
          {
            replacements: {
              module_name: "VANS",
              request_txt_label: "R9 Aging Report",
              req_date: date,
              req_code: "R9VANS",
              user_id: user_id,
              msg_type: "file",
              status: "pending",
              insert_date: moment(new Date()).format("YYYY-MM-DD HH:mm:ss"),
              other_data: JSON.stringify({
                fileName: "R9 Aging Report",
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

      console.log("Starting R9 Aging Report generation...");

      // OPTIMIZED APPROACH - Single query to get stock data
      const stockQuery = `
        SELECT 
          c.c_part_no,
          c.c_name,
          c.c_specification,
          c.component_key,
          rl.cost_center,
          CASE rl.cost_center
            WHEN '2023122105635288' THEN 'NAVS'
            WHEN '2023122105635289' THEN 'VANS'
            WHEN '2023122105635290' THEN 'SILICON'
            ELSE 'UNKNOWN'
          END as cost_center_name,
          COALESCE(SUM(CASE 
            WHEN rl.trans_type IN ('INWARD', 'TRANSFER') 
            THEN (rl.qty + rl.other_qty) 
            ELSE 0 
          END), 0) as total_inward,
          COALESCE(SUM(CASE 
            WHEN rl.trans_type NOT IN ('INWARD', 'INTRANSIT', 'CANCELLED', 'INTRANSITISSUE', 'TRANSFER') 
            THEN (rl.qty + rl.other_qty) 
            ELSE 0 
          END), 0) as total_outward
        FROM components c
        LEFT JOIN rm_location rl ON c.component_key = rl.components_id 
          AND DATE_FORMAT(rl.insert_date,'%Y-%m-%d') <= :reportDate
          AND rl.cost_center IN ('2023122105635288', '2023122105635289', '2023122105635290')
        WHERE c.c_type = 'R'
        GROUP BY c.component_key, rl.cost_center, c.c_part_no, c.c_name, c.c_specification
        HAVING (total_inward - total_outward) > 0
      `;

      const stockData = await vansDB.query(stockQuery, {
        replacements: { reportDate: date },
        type: vansDB.QueryTypes.SELECT,
      });

      console.log(`Found ${stockData.length} stock records to process`);

      // Get last inward dates in batch
      const lastInwardQuery = `
        SELECT 
          rt.components_id,
          rt.cost_center,
          rt.insert_date,
          rt.in_transaction_id,
          ROW_NUMBER() OVER (PARTITION BY rt.components_id, rt.cost_center ORDER BY rt.insert_date DESC) as rn
        FROM rm_transaction rt
        WHERE rt.trans_type = 'INWARD'
          AND rt.cost_center IN ('2023122105635288', '2023122105635289', '2023122105635290')
          AND rt.components_id IN (${stockData.map(item => `'${item.component_key}'`).join(',')})
      `;

      let lastInwardData = [];
      if (stockData.length > 0) {
        const fullLastInwardQuery = `
          SELECT * FROM (${lastInwardQuery}) as ranked_inwards WHERE rn = 1
        `;
        lastInwardData = await vansDB.query(fullLastInwardQuery, {
          type: vansDB.QueryTypes.SELECT,
        });
      }

      console.log(`Found ${lastInwardData.length} last inward records`);

      // Get latest rates in batch
      const rateQuery = `
        SELECT 
          rl.components_id,
          rl.cost_center,
          rl.in_rate,
          rl.exchange_rate,
          rl.currency_type,
          ROW_NUMBER() OVER (PARTITION BY rl.components_id, rl.cost_center ORDER BY rl.ID DESC) as rn
        FROM rm_location rl
        WHERE rl.trans_type = 'INWARD'
          AND rl.cost_center IN ('2023122105635288', '2023122105635289', '2023122105635290')
          AND rl.components_id IN (${stockData.length > 0 ? stockData.map(item => `'${item.component_key}'`).join(',') : "''"})
      `;

      let rateData = [];
      if (stockData.length > 0) {
        const fullRateQuery = `
          SELECT * FROM (${rateQuery}) as ranked_rates WHERE rn = 1
        `;
        rateData = await vansDB.query(fullRateQuery, {
          type: vansDB.QueryTypes.SELECT,
        });
      }

      console.log(`Found ${rateData.length} rate records`);

      // Create lookup maps for faster access
      const lastInwardMap = new Map();
      lastInwardData.forEach(item => {
        const key = `${item.components_id}_${item.cost_center}`;
        lastInwardMap.set(key, item);
      });

      const rateMap = new Map();
      rateData.forEach(item => {
        const key = `${item.components_id}_${item.cost_center}`;
        rateMap.set(key, item);
      });

      // Process stock data
      const componentStockMap = new Map();

      stockData.forEach(stock => {
        if (!stock.cost_center) return;

        const current_stock = helper.number(stock.total_inward) - helper.number(stock.total_outward);
        
        if (current_stock > 0) {
          const lookupKey = `${stock.component_key}_${stock.cost_center}`;
          
          // Get last inward info
          const lastInward = lastInwardMap.get(lookupKey);
          let lastInwardDate = null;
          let minNumber = 'N/A';
          let agingDays = 0;
          let agingCategory = 'No Inward';

          if (lastInward) {
            lastInwardDate = moment(lastInward.insert_date);
            minNumber = lastInward.in_transaction_id || 'N/A';
            agingDays = currentDate.diff(lastInwardDate, 'days');

            // Categorize aging
            if (agingDays >= 0 && agingDays <= 30) {
              agingCategory = '0-30';
            } else if (agingDays >= 31 && agingDays <= 60) {
              agingCategory = '31-60';
            } else if (agingDays >= 61 && agingDays <= 90) {
              agingCategory = '61-90';
            } else if (agingDays >= 91 && agingDays <= 180) {
              agingCategory = '91-180';
            } else if (agingDays > 180) {
              agingCategory = '180+';
            }
          }

          // Get rate info
          const rateInfo = rateMap.get(lookupKey);
          const rate = rateInfo ? rateInfo.in_rate : 0;
          const exch_rate = rateInfo ? rateInfo.exchange_rate : 1;

          // Create unique key for component + cost center
          const componentKey = `${stock.c_part_no}_${stock.c_name}_${stock.c_specification}_${stock.cost_center}`;
          
          if (!componentStockMap.has(componentKey)) {
            componentStockMap.set(componentKey, {
              PART_CODE: stock.c_part_no,
              PART_NAME: stock.c_name,
              DESC: stock.c_specification,
              COST_CENTER: stock.cost_center_name,
              LAST_INWARD_DATE: 'N/A',
              MIN_NUMBER: 'N/A',
              '0-30': 0,
              '31-60': 0,
              '61-90': 0,
              '91-180': 0,
              '180+': 0,
              'No Inward': 0,
              TOTAL_STOCK: 0,
              TOTAL_VALUE_LC: 0,
              TOTAL_VALUE_FC: 0,
              AGING_PRIORITY: 0, // For sorting - higher number = older stock
            });
          }

          const componentData = componentStockMap.get(componentKey);
          
          // Add stock to appropriate aging column
          if (agingCategory !== 'No Inward') {
            componentData[agingCategory] += current_stock;
          } else {
            componentData['No Inward'] += current_stock;
          }
          
          componentData.TOTAL_STOCK += current_stock;
          componentData.TOTAL_VALUE_LC += Math.round((current_stock * rate * exch_rate) * 100) / 100;
          componentData.TOTAL_VALUE_FC += Math.round((current_stock * rate) * 100) / 100;
          
          // Set aging priority for sorting (oldest first)
          if (componentData['180+'] > 0) componentData.AGING_PRIORITY = 5;
          else if (componentData['91-180'] > 0) componentData.AGING_PRIORITY = 4;
          else if (componentData['61-90'] > 0) componentData.AGING_PRIORITY = 3;
          else if (componentData['31-60'] > 0) componentData.AGING_PRIORITY = 2;
          else if (componentData['0-30'] > 0) componentData.AGING_PRIORITY = 1;
          else componentData.AGING_PRIORITY = 0;
          
          // Update last inward date and aging days for sorting
          if (lastInwardDate) {
            componentData.LAST_INWARD_DATE = lastInwardDate.format("DD-MM-YYYY");
            componentData.MIN_NUMBER = minNumber;
            componentData.AGING_DAYS = agingDays; // Store for sorting
          }
        }
      });

      // Convert map to array
      let resultOfAgingStock = Array.from(componentStockMap.values()).filter(item => item.TOTAL_STOCK > 0);

      console.log(`Generated ${resultOfAgingStock.length} aging records`);

      if (resultOfAgingStock.length > 0) {
        // Sort by aging priority (oldest first) and then by aging days (descending)
        resultOfAgingStock.sort((a, b) => {
          // First sort by aging priority (5 = 180+, 4 = 91-180, etc.)
          if (a.AGING_PRIORITY !== b.AGING_PRIORITY) {
            return b.AGING_PRIORITY - a.AGING_PRIORITY; // Higher priority (older) first
          }
          // If same priority, sort by aging days (older first)
          if (a.AGING_DAYS && b.AGING_DAYS) {
            return b.AGING_DAYS - a.AGING_DAYS;
          }
          // Finally sort by part code for consistency
          return a.PART_CODE.localeCompare(b.PART_CODE);
        });

        // CREATE EXCEL FILE WITH COLUMN-BASED FORMAT
        const workbook = xlsx.utils.book_new();
        
        // Prepare the final data array with aging columns
        const finalData = [
          // Company header rows
          [c_details[0].company_name],
          [c_details[0].company_address],
          [`${c_details[0].company_city} - ${c_details[0].company_pin_code}`],
          [`GST Registration : ${c_details[0].company_gst_no}`],
          [`R9 REPORT - INVENTORY AGING REPORT`],
          [`Report Date : ${moment(date).format("DD-MM-YYYY")} | Generated : ${moment(new Date()).format("DD-MM-YYYY HH:mm:ss")}`],
          [`Generated By : ${c_details[0].user_name} | Total Records: ${resultOfAgingStock.length}`],
          [], // Empty row
          // Column headers with COST_CENTER added
          ['PART_CODE', 'PART_NAME', 'DESC', 'COST_CENTER', 'LAST_INWARD_DATE', 'MIN_NUMBER', '0-30 Days', '31-60 Days', '61-90 Days', '91-180 Days', '180+ Days', 'No Inward', 'TOTAL_STOCK', 'TOTAL_VALUE_LC', 'TOTAL_VALUE_FC']
        ];

        // Add data rows with COST_CENTER included
        resultOfAgingStock.forEach(item => {
          finalData.push([
            item.PART_CODE,
            item.PART_NAME,
            item.DESC,
            item.COST_CENTER,
            item.LAST_INWARD_DATE,
            item.MIN_NUMBER,
            item['0-30'],
            item['31-60'],
            item['61-90'],
            item['91-180'],
            item['180+'],
            item['No Inward'],
            item.TOTAL_STOCK,
            item.TOTAL_VALUE_LC,
            item.TOTAL_VALUE_FC
          ]);
        });

        const worksheet = xlsx.utils.aoa_to_sheet(finalData);
        
        // Set column widths (updated for new COST_CENTER column)
        worksheet['!cols'] = [
          { wch: 12 }, // PART_CODE
          { wch: 25 }, // PART_NAME
          { wch: 30 }, // DESC
          { wch: 12 }, // COST_CENTER
          { wch: 15 }, // LAST_INWARD_DATE
          { wch: 15 }, // MIN_NUMBER
          { wch: 12 }, // 0-30 Days
          { wch: 12 }, // 31-60 Days
          { wch: 12 }, // 61-90 Days
          { wch: 12 }, // 91-180 Days
          { wch: 12 }, // 180+ Days
          { wch: 12 }, // No Inward
          { wch: 12 }, // TOTAL_STOCK
          { wch: 15 }, // TOTAL_VALUE_LC
          { wch: 15 }  // TOTAL_VALUE_FC
        ];

        // Add autofilter to data section (updated range for new column)
        worksheet['!autofilter'] = { ref: `A9:O${8 + resultOfAgingStock.length + 1}` };

        xlsx.utils.book_append_sheet(workbook, worksheet, "R9 Aging Report");
        xlsx.writeFile(workbook, fileName);
        
        console.log("R9 Aging Report Excel file created successfully.");

        let attachment = [
          {
            filename: fileName,
            content: fs.readFileSync(fileName),
          },
        ];

        await sendMail(
          userEmail, 
          "", 
          "R9 Aging Report [File Ready for download]", 
          htmlTemplate(user[0].user_name, new Date(), "R9", "https://socket.mscapi.live/" + fileName), 
          attachment
        );

        let stmt_update = await vansOtherDB.query(
          "UPDATE user_files_req SET status = :status WHERE user_id = :user_id AND module_name = :module_name AND req_code = :req_code",
          {
            replacements: {
              status: "complete",
              user_id: user_id,
              module_name: "VANS",
              req_code: "R9VANS",
            },
          }
        );

        socket.emit("agingReportComplete", { 
          message: "R9 Aging Report generated successfully", 
          fileName: fileName,
          totalRecords: resultOfAgingStock.length
        });

        console.log(`R9 Report completed with ${resultOfAgingStock.length} records`);
      } else {
        socket.emit("noDataFound", { message: "No stock found for aging report" });
        console.log("No stock data found for aging report");
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
    console.error("Error in aging report:", error);
    socket.emit("errorMs", error.stack);
  }
};