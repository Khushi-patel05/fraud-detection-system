# SentinelAI — Automated Fraud Detection & Behavioral Transaction Audit System

A full-stack fraud detection and transaction monitoring system designed to identify suspicious financial activity, assess transaction risk, manage fraud alerts, and support structured investigations through an interactive dashboard.

## 📌 Project Overview

**SentinelAI** is a database-driven application that combines MySQL and MongoDB to support transaction monitoring, rule-based risk analysis, fraud alert management, investigation tracking, and audit logging.

The system provides a centralized interface for fraud analysts and administrators to review transactions, evaluate risk scores, manage cases, record investigation notes, and inspect audit trails.

By combining structured relational records with flexible document-oriented risk-analysis data, SentinelAI demonstrates how multiple database technologies can work together in a financial fraud monitoring application.

## 🎯 Objectives

- Monitor financial transactions and identify potentially suspicious activity.
- Assign risk scores and risk categories using rule-based analysis.
- Generate and manage fraud alerts.
- Track investigation cases, priorities, conclusions, and notes.
- Maintain audit logs for important system activities.
- Enforce authentication and role-based access control.
- Integrate relational transaction data with flexible risk-analysis documents.

## ✨ Key Features

- **Dashboard:** Centralized overview of transaction monitoring and fraud management.
- **Transaction Monitoring:** View and inspect transaction records.
- **Risk Analysis:** Calculate and display transaction risk scores, categories, and associated risk information.
- **Fraud Alert Management:** Review fraud alerts and manage their statuses.
- **Investigation Management:** Track investigation cases, priorities, conclusions, and progress.
- **Investigation Notes:** Record and retrieve notes associated with investigation cases.
- **Audit Logs:** Review important system activities and applicable status changes.
- **Customer View:** Access customer-related information.
- **Authentication:** Sign in using configured user credentials.
- **Role-Based Access Control:** Separate administrator and fraud analyst permissions.
- **Database Connectivity:** Integrate MySQL and MongoDB.
- **Transaction Audit:** Combine relational transaction records with corresponding MongoDB risk-analysis results.
- **Paginated Data Retrieval:** Retrieve transaction records through paginated API requests.
- **Administrative Diagnostics:** Provide protected database connectivity checks.

## 🛠️ Technology Stack

| Component | Technology |
|---|---|
| Frontend | Next.js, React, TypeScript |
| Styling | Tailwind CSS |
| Backend | Next.js App Router API routes |
| Relational Database | MySQL |
| Document Database | MongoDB |
| Authentication | NextAuth.js |
| Password Hashing | bcryptjs |
| Input Validation | Zod |
| Icons | Lucide React |
| Runtime | Node.js |
| Package Manager | npm |

## 🏗️ System Architecture

The application follows a full-stack architecture consisting of the following layers:

1. **Presentation Layer:** Provides the dashboard, transaction views, fraud alerts, investigations, audit logs, customer information, and login interface.

2. **Application Layer:** Next.js API routes handle client requests, authentication, authorization, input validation, database operations, and application logic.

3. **Relational Data Layer (MySQL):** Stores structured records such as users, customers, accounts, transactions, fraud alerts, investigation cases, case notes, and audit logs.

4. **Document Data Layer (MongoDB):** Stores flexible risk-analysis results and related document-oriented information.

5. **Security Layer:** Uses NextAuth.js authentication and role-based authorization to protect application pages and API endpoints.

### Database Integration

MySQL acts as the primary relational database for structured transaction and fraud-management records.

MongoDB complements MySQL by storing risk-analysis documents that can be associated with individual transactions.

The transaction-audit API retrieves paginated transaction records from MySQL and combines them with the corresponding latest risk-analysis documents from MongoDB.

## 🗄️ Database Design

### MySQL

The relational database contains tables for structured application data, including:

- `users`
- `customers`
- `accounts`
- `transactions`
- `fraud_alerts`
- `investigation_cases`
- `case_notes`
- `audit_logs`
- `behavior_profiles`
- Other schema-specific tables, if present in the configured database.

The application also uses the following monitoring views:

- `v_transaction_monitoring`
- `v_fraud_alert_dashboard`

These views support transaction monitoring and fraud-alert dashboard operations.

### MongoDB

MongoDB supports document-oriented storage for flexible risk-analysis and related information.

Collections used or supported by the project include:

- `risk_analysis`
- `behavior_events`
- `investigation_evidence`

The exact schema and available fields depend on the configured database and application implementation.

## 🔐 Security

The project incorporates the following security measures:

- Credential-based authentication.
- Password verification using bcrypt.
- Role-based authorization for administrative operations.
- Server-side protection for supported API endpoints.
- Input validation for supported operations.
- Audit logging for selected investigation and alert activities.
- Environment variables for database and authentication configuration.

**Security Note:** Never commit `.env.local`, database passwords, authentication secrets, session tokens, or other sensitive credentials to version control.

## ⚙️ Prerequisites

Install the following before running the project:

- Node.js (the project was tested with Node.js 22).
- npm.
- MySQL Server.
- MongoDB Server or a configured MongoDB deployment.
- Git.

## 🚀 Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/Khushi-patel05/fraud-detection-system.git

cd fraud-detection-system
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a local `.env.local` file in the project root.

Configure the database connection values and authentication settings required by the application.

The following are illustrative configuration keys. Use the exact variable names expected by the project's database and authentication configuration files.

```env
# MySQL connection settings
DB_HOST=
DB_PORT=
DB_USER=
DB_PASSWORD=
DB_NAME=

# MongoDB connection
MONGODB_URI=

# NextAuth configuration
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=
```

**Important:**
- Use the exact environment variable names expected by the application.
- Configure valid MySQL and MongoDB connection details.
- Generate a secure authentication secret.
- Keep `.env.local` local and do not commit it to GitHub.
- Do not use production credentials in a public repository.

### 4. Configure the Databases

**MySQL Setup**

- Start the MySQL server.
- Create or configure the project database.
- Create or import the required tables and relationships.
- Configure the monitoring views expected by the application.
- Ensure that the database user has the required permissions.

**MongoDB Setup**

- Start MongoDB or configure a MongoDB deployment.
- Configure the MongoDB connection URI.
- Create or populate the required collections.
- Ensure the application can access the required collections.

The application expects the database schema and views used by its API routes to be available before the dashboard can retrieve the corresponding information.

### 5. Populate MongoDB Risk-Analysis Data

The repository includes a MongoDB seeding script:

```bash
node scripts/seed-mongodb.cjs
```

This script uses the configured environment variables to connect to the databases and populate MongoDB with risk-analysis documents based on the available transaction data.

Run the script only after configuring the required database connections and ensuring that the expected MySQL transaction data is available.

### 6. Start the Development Server

```bash
npm run dev
```

Open the following address in your browser:

```text
http://localhost:3000
```

### 7. Create a Production Build

```bash
npm run build
```

To run the production build locally:

```bash
npm start
```

## 🧪 Testing and Verification

The following checks can be used to verify the application:

- Confirm that the application builds successfully.
- Verify login and logout functionality.
- Verify that unauthenticated requests to protected endpoints are rejected.
- Verify that analyst accounts cannot access administrator-only operations.
- Test transaction monitoring and paginated data retrieval.
- Verify that transaction records are combined with MongoDB risk-analysis results.
- Test fraud-alert status changes.
- Test investigation workflows, notes, and applicable audit entries.
- Verify MySQL and MongoDB connectivity using authorized diagnostic endpoints.

Actual results depend on the configured databases, application permissions, and available test data.

## 📁 Project Structure

```text
fraud-detection-system/
│
├── scripts/
│   └── seed-mongodb.cjs
│
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── audit-logs/
│   │   │   ├── auth/
│   │   │   ├── db-test/
│   │   │   ├── fraud-alerts/
│   │   │   ├── investigations/
│   │   │   ├── mongo-test/
│   │   │   ├── risk-analysis/
│   │   │   ├── transaction-audit/
│   │   │   ├── transactions/
│   │   │   └── users/
│   │   │
│   │   ├── login/
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   │
│   ├── lib/
│   │   ├── api-auth.ts
│   │   ├── auth.ts
│   │   ├── db.ts
│   │   └── mongo.ts
│   │
│   ├── middleware.ts
│   └── types/
│
├── public/
├── .gitignore
├── package.json
├── package-lock.json
└── README.md
```

*Note: This is a high-level representation of the project structure. Additional files and directories may exist in the repository.*

## ⚠️ Scope and Limitations

- Risk scoring is **rule-based**, not a trained machine-learning model.
- Detection quality depends on the implemented rules, transaction data, and configured thresholds.
- The system is intended as an academic DBMS mini project and demonstration, not as a production-ready financial fraud prevention platform.
- The effectiveness of fraud detection depends on the completeness and quality of the available data.
- Production deployment would require additional security hardening, operational monitoring, privacy controls, scalability improvements, and extensive validation.

## 🔮 Future Enhancements

- Introduce machine-learning-based fraud classification.
- Add behavioral anomaly detection and adaptive risk thresholds.
- Integrate explainable AI for risk-score interpretation.
- Improve reporting and transaction trend visualization.
- Add notifications for high-risk alerts.
- Introduce automated test coverage and deployment pipelines.
- Strengthen data governance and production security controls.

## 👩‍💻 Team Members

| Name | SRN |
|---|---|
| Khushi Patel | PES1UG24AM134 |
| Karanam Sreehitha | PES1UG24AM129 |

## 🎓 Project Information

| Field | Details |
|---|---|
| Project Title | Automated Fraud Detection & Behavioral Transaction Audit System |
| Project Name | SentinelAI |
| Project Type | DBMS Mini Project |
| Repository | [fraud-detection-system](https://github.com/Khushi-patel05/fraud-detection-system) |

---

**SentinelAI — Making Transaction Monitoring More Transparent, Structured, and Explainable.**
