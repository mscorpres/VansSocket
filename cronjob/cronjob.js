
const cron = require("node-cron");
const moment = require("moment");
const { vansOtherDB } = require("../config/db/connection");
const { error_log } = require("../helper/utils");
const fs = require("fs")
const path = require("path");

// Function to delete old files from filesystem (recursively through all folders in files/)
async function deleteOldFilesFromFolder(dirPath) {
  const deletedFiles = [];
  const errors = [];
  
  // Allowed file extensions (only delete these file types, not folders)
  const allowedExtensions = [
    '.xlsx', '.xls', '.csv', // Excel
    '.doc', '.docx', // Word
    '.pdf', // PDF
    '.zip', '.rar', '.7z', // Archives
    '.xml', // XML
    '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp', // Images
    '.txt', '.log', // Text files
    '.json' // JSON
  ];
  
  try {
    if (!fs.existsSync(dirPath)) {
      console.log(`Directory does not exist: ${dirPath}`);
      return { deletedFiles: [], errors: [] };
    }
    
    const items = await fs.promises.readdir(dirPath);
    
    for (const item of items) {
      const itemPath = path.join(dirPath, item);
      
      try {
        const stats = await fs.promises.stat(itemPath);
        
        // Check if it's a directory
        if (stats.isDirectory()) {
          // Recursively process subdirectories (but don't delete the folder itself)
          const subResult = await deleteOldFilesFromFolder(itemPath);
          deletedFiles.push(...subResult.deletedFiles);
          errors.push(...subResult.errors);
        } else if (stats.isFile()) {
          // It's a file - check extension and age
          const fileExt = path.extname(item).toLowerCase();
          
          // Only process files with allowed extensions
          if (allowedExtensions.includes(fileExt)) {
            // Check if file is older than 12 hours
            const fileAge = moment().diff(moment(stats.birthtime), 'hours');
            
            if (fileAge >= 12) {
              // Delete the file
              await fs.promises.unlink(itemPath);
              deletedFiles.push(itemPath);
              console.log(`Deleted old file: ${itemPath}`);
            }
          }
        }
      } catch (itemError) {
        errors.push({ path: itemPath, error: itemError.message });
        console.error(`Error processing ${itemPath}:`, itemError.message);
      }
    }
  } catch (dirError) {
    errors.push({ path: dirPath, error: dirError.message });
    console.error(`Error reading directory ${dirPath}:`, dirError.message);
    error_log({ stack: dirError.stack });
  }
  
  return { deletedFiles, errors };
}

// Function to delete records older than 12 hours from database
async function deleteOldFiles() {
  try {
    console.log(`Starting database cleanup at ${new Date().toISOString()}`);
    
    const twelveHoursAgo = moment().subtract(12, "hours").format("YYYY-MM-DD HH:mm:ss");
    
    // First, count how many records will be deleted
    const countResult = await vansOtherDB.query(
      "SELECT COUNT(*) as count FROM `user_files_req` WHERE `insert_date` < :twelveHoursAgo",
      {
        replacements: { twelveHoursAgo: twelveHoursAgo },
        type: vansOtherDB.QueryTypes.SELECT,
      }
    );
    
    const deletedCount = countResult[0]?.count || 0;
    
    // Delete records older than 12 hours from database
    await vansOtherDB.query(
      "DELETE FROM `user_files_req` WHERE `insert_date` < :twelveHoursAgo",
      {
        replacements: { twelveHoursAgo: twelveHoursAgo },
        type: vansOtherDB.QueryTypes.DELETE,
      }
    );
    
    console.log(`Deleted ${deletedCount} records older than 12 hours from database`);
    
    // After deleting from database, delete old files from filesystem
    console.log(`Starting filesystem cleanup in files/ directory...`);
    const filesResult = await deleteOldFilesFromFolder('./files');
    
    console.log(`\n=== Cleanup Summary ===`);
    console.log(`Records deleted from DB: ${deletedCount}`);
    console.log(`Files deleted from filesystem: ${filesResult.deletedFiles.length}`);
    console.log(`Errors: ${filesResult.errors.length}`);
    
    if (filesResult.errors.length > 0) {
      console.log(`Errors encountered:`, filesResult.errors);
    }
    
    return {
      deletedCount: deletedCount,
      deletedFiles: filesResult.deletedFiles.length,
      errors: filesResult.errors.length
    };
    
  } catch (error) {
    console.error(`Error in deleteOldFiles function:`, error.message);
    error_log({ stack: error.stack });
    throw error;
  }
}

// Cron job to delete files older than 12 hours - runs every 5 minutes
cron.schedule("*/5 * * * *", async () => {
  console.log(`File cleanup cron job triggered at ${new Date().toISOString()}`);
  try {
    await deleteOldFiles();
    console.log(`File cleanup completed successfully`);
  } catch (error) {
    console.error(`Error executing file cleanup cron job: ${error.message}`, error.stack);
    error_log({ stack: error.stack });
  }
});

// Export the function for use in cron jobs or manual calls
module.exports = { deleteOldFiles };

