
require("dotenv").config({ path: ".env.local" });

const mysql = require("mysql2/promise");
const { MongoClient } = require("mongodb");

function analyzeTransaction(transaction) {
  const amount = Number(transaction.amount);
  const normalLimit = Number(transaction.max_normal_amount ?? 0);

  if (!Number.isFinite(amount) || amount < 0) {
    return {
      riskScore: 0,
      riskLevel: "LOW",
      reasons: ["Transaction amount is invalid; manual review is required"],
      dataQualityIssue: true,
    };
  }

  const location = transaction.transaction_location?.trim().toLowerCase() ?? "";
  const usualLocation = transaction.usual_location?.trim().toLowerCase() ?? "";

  let riskScore = 0;
  const reasons = [];
  let dataQualityIssue = false;

  if (!Number.isFinite(normalLimit) || normalLimit < 0) {
    dataQualityIssue = true;
    reasons.push("Normal spending limit is missing or invalid");
  } else if (normalLimit > 0 && amount > normalLimit) {
    const ratio = amount / normalLimit;

    if (ratio >= 5) {
      riskScore += 50;
      reasons.push("Transaction amount is at least 5 times the normal spending limit");
    } else if (ratio >= 3) {
      riskScore += 35;
      reasons.push("Transaction amount is at least 3 times the normal spending limit");
    } else if (ratio >= 2) {
      riskScore += 25;
      reasons.push("Transaction amount is at least 2 times the normal spending limit");
    } else {
      riskScore += 15;
      reasons.push("Transaction amount exceeds the normal spending limit");
    }
  }

  if (location && usualLocation && location !== usualLocation) {
    riskScore += 30;
    reasons.push("Transaction location differs from the customer's usual location");
  }

  if (!location || !usualLocation) {
    dataQualityIssue = true;
    reasons.push("Transaction location or usual location is unavailable");
  }

  riskScore = Math.min(riskScore, 100);

  const riskLevel =
    riskScore >= 70 ? "HIGH" :
    riskScore >= 40 ? "MEDIUM" : "LOW";

  if (reasons.length === 0) {
    reasons.push("No configured amount or location risk rules were triggered");
  }

  return { riskScore, riskLevel, reasons, dataQualityIssue };
}

function buildBehaviorEvent(transaction, index) {
  const amount = Number(transaction.amount);
  const normalLimit = Number(transaction.max_normal_amount ?? 0);
  const location = transaction.transaction_location?.trim() ?? "";
  const usualLocation = transaction.usual_location?.trim() ?? "";
  const status = transaction.transaction_status;

  let eventType = "TRANSACTION_ACTIVITY";
  let severity = "LOW";
  let description = "Transaction recorded for behavioral analysis";

  if (status === "BLOCKED") {
    eventType = "BLOCKED_TRANSACTION";
    severity = "HIGH";
    description = "Transaction has a BLOCKED status";
  } else if (status === "FAILED") {
    eventType = "FAILED_TRANSACTION";
    severity = "MEDIUM";
    description = "Transaction has a FAILED status";
  } else if (
    normalLimit > 0 &&
    Number.isFinite(amount) &&
    amount > normalLimit * 2
  ) {
    eventType = "AMOUNT_DEVIATION";
    severity = amount >= normalLimit * 5 ? "HIGH" : "MEDIUM";
    description = "Transaction amount exceeds twice the normal spending limit";
  } else if (
    location &&
    usualLocation &&
    location.toLowerCase() !== usualLocation.toLowerCase()
  ) {
    eventType = "LOCATION_MISMATCH";
    severity = "MEDIUM";
    description = "Transaction location differs from the usual location";
  }

  return {
    eventId: `SYN-BEH-${String(index).padStart(6, "0")}`,
    transactionId: Number(transaction.transaction_id),
    transactionReference: transaction.transaction_reference,
    customerId: Number(transaction.customer_id),
    customerName: transaction.customer_name,
    eventType,
    severity,
    description,
    amount: Number.isFinite(amount) ? amount : null,
    location: location || null,
    usualLocation: usualLocation || null,
    transactionStatus: status,
    eventTime: new Date(transaction.transaction_time),
    syntheticDemoData: true,
    createdAt: new Date(),
  };
}

function buildEvidenceDocument(row, index) {
  const evidenceTypes = [
    "TRANSACTION_SUMMARY",
    "RISK_ANALYSIS_SNAPSHOT",
    "BEHAVIORAL_REVIEW",
    "LOCATION_REVIEW",
    "STATUS_REVIEW",
  ];

  const evidenceType = evidenceTypes[(index - 1) % evidenceTypes.length];

  return {
    evidenceId: `SYN-EVD-${String(index).padStart(6, "0")}`,
    caseId: Number(row.case_id),
    alertId: Number(row.alert_id),
    transactionId: Number(row.transaction_id),
    evidenceType,
    title: `Simulated ${evidenceType.toLowerCase().replaceAll("_", " ")}`,
    description:
      "Synthetic demonstration record generated for the DBMS mini project. " +
      "This is not genuine forensic evidence or proof of fraud.",
    details: {
      caseStatus: row.case_status,
      casePriority: row.priority,
      alertStatus: row.alert_status,
      riskLevel: row.risk_level,
      riskScore: Number(row.risk_score),
      transactionReference: row.transaction_reference,
      transactionStatus: row.transaction_status,
      amount: Number(row.amount),
      location: row.transaction_location ?? null,
    },
    source: "SYNTHETIC_DEMO_DATA",
    syntheticDemoData: true,
    recordedAt: new Date(),
  };
}

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is missing from .env.local");
  }

  const mysqlConfig = {
    host: process.env.MYSQL_HOST || "localhost",
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE || "fraud_detection_db",
  };

  if (!mysqlConfig.host || !mysqlConfig.user || !mysqlConfig.password) {
    throw new Error(
      "MySQL configuration is incomplete. Check the variable names used in src/lib/db.ts."
    );
  }

  const sql = await mysql.createConnection(mysqlConfig);
  const mongo = new MongoClient(process.env.MONGODB_URI);

  try {
    await mongo.connect();

    const database = mongo.db("fraud_detection_db");
    const riskCollection = database.collection("risk_analysis");
    const behaviorCollection = database.collection("behavior_events");
    const evidenceCollection = database.collection("investigation_evidence");

    const [transactions] = await sql.query(`
      SELECT
        transaction_id,
        transaction_reference,
        customer_id,
        customer_name,
        amount,
        transaction_location,
        transaction_status,
        transaction_time,
        max_normal_amount,
        usual_location
      FROM v_transaction_monitoring
      ORDER BY transaction_id
    `);

    console.log(`Found ${transactions.length} transactions.`);

    // PART 1: Seed risk_analysis.
    const batchSize = 500;

    for (let i = 0; i < transactions.length; i += batchSize) {
      const batch = transactions.slice(i, i + batchSize);
      const analyzedAt = new Date();

      const operations = batch.map((transaction) => {
        const analysis = analyzeTransaction(transaction);

        const document = {
          transactionId: Number(transaction.transaction_id),
          transactionReference: transaction.transaction_reference,
          customerId: Number(transaction.customer_id),
          customerName: transaction.customer_name,
          amount: Number(transaction.amount),
          location: transaction.transaction_location,
          transactionStatus: transaction.transaction_status,
          riskScore: analysis.riskScore,
          riskLevel: analysis.riskLevel,
          reasons: analysis.reasons,
          dataQualityIssue: analysis.dataQualityIssue,
          analyzedAt,
        };

        return {
          updateOne: {
            filter: { transactionId: document.transactionId },
            update: { $set: document },
            upsert: true,
          },
        };
      });

      if (operations.length) {
        await riskCollection.bulkWrite(operations, { ordered: true });
      }

      console.log(
        `Risk analysis: ${Math.min(i + batch.length, transactions.length)}/${transactions.length}`
      );
    }

    console.log(`risk_analysis count: ${await riskCollection.countDocuments()}`);

    // PART 2: Seed up to 5,000 behavior events.
    const eventTransactions = transactions.slice(0, 5000);

    for (let i = 0; i < eventTransactions.length; i += batchSize) {
      const batch = eventTransactions.slice(i, i + batchSize);

      const operations = batch.map((transaction, batchIndex) => {
        const eventIndex = i + batchIndex + 1;
        const document = buildBehaviorEvent(transaction, eventIndex);

        return {
          updateOne: {
            filter: { eventId: document.eventId },
            update: { $set: document },
            upsert: true,
          },
        };
      });

      if (operations.length) {
        await behaviorCollection.bulkWrite(operations, { ordered: true });
      }

      console.log(
        `Behavior events: ${Math.min(i + batch.length, eventTransactions.length)}/${eventTransactions.length}`
      );
    }

    console.log(
      `behavior_events count: ${await behaviorCollection.countDocuments()}`
    );

    // PART 3: Seed up to 300 evidence records linked to existing cases.
    const [caseRows] = await sql.query(`
      SELECT
        ic.case_id,
        ic.alert_id,
        ic.case_status,
        ic.priority,
        fa.transaction_id,
        fa.risk_score,
        fa.risk_level,
        fa.alert_status,
        t.transaction_reference,
        t.amount,
        t.transaction_location,
        t.transaction_status
      FROM investigation_cases ic
      INNER JOIN fraud_alerts fa ON fa.alert_id = ic.alert_id
      INNER JOIN transactions t ON t.transaction_id = fa.transaction_id
      ORDER BY ic.case_id
    `);

    if (caseRows.length === 0) {
      console.log(
        "No investigation cases found. Skipping investigation_evidence seeding."
      );
    } else {
      const evidenceCount = 300;
      const evidenceOperations = [];

      for (let i = 1; i <= evidenceCount; i++) {
        const row = caseRows[(i - 1) % caseRows.length];
        const document = buildEvidenceDocument(row, i);

        evidenceOperations.push({
          updateOne: {
            filter: { evidenceId: document.evidenceId },
            update: { $set: document },
            upsert: true,
          },
        });
      }

      for (let i = 0; i < evidenceOperations.length; i += batchSize) {
        await evidenceCollection.bulkWrite(
          evidenceOperations.slice(i, i + batchSize),
          { ordered: true }
        );
        console.log(
          `Investigation evidence: ${Math.min(i + batchSize, evidenceOperations.length)}/${evidenceOperations.length}`
        );
      }
    }

    console.log(
      `investigation_evidence count: ${await evidenceCollection.countDocuments()}`
    );

    console.log("All MongoDB seeding tasks completed successfully.");
  } finally {
    await sql.end();
    await mongo.close();
  }
}

main().catch((error) => {
  console.error("Seeding failed:", error.message);
  process.exitCode = 1;
});
