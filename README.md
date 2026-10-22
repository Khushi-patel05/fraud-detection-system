# SentinelAI — Automated Fraud Detection & Behavioral Transaction Audit System

A full-stack fraud detection and transaction monitoring system designed to identify suspicious financial activity, assess transaction risk, manage fraud alerts, and support structured investigations through an interactive dashboard.

## 📌 Project Overview

**SentinelAI** is a database-driven application that combines MySQL and MongoDB to support transaction monitoring, rule-based risk analysis, fraud alert management, investigation tracking, and audit logging.

The system provides a centralized interface for fraud analysts and administrators to review transactions, evaluate risk scores, manage cases, record investigation notes, and inspect audit trails.

## 🎯 Objectives

- Monitor financial transactions and identify potentially suspicious activity.
- Assign risk scores and risk categories using rule-based analysis.
- Generate and manage fraud alerts.
- Track investigations, case status, priorities, conclusions, and notes.
- Maintain audit logs for important system activities.
- Enforce authentication and role-based access control.
- Combine relational transaction data with flexible risk-analysis documents.

## ✨ Key Features

- **Dashboard:** Centralized overview of transaction monitoring and fraud management.
- **Transaction Monitoring:** View and inspect transaction records.
- **Risk Analysis:** Calculate and display transaction risk scores and categories.
- **Fraud Alert Management:** Review alerts and manage their statuses.
- **Investigation Management:** Track investigation cases, priorities, conclusions, and progress.
- **Investigation Notes:** Record and retrieve notes associated with cases.
- **Audit Logs:** Review important actions and status changes.
- **Customer View:** Access customer-related information.
- **Authentication:** Sign in using configured user credentials.
- **Role-Based Access Control:** Separate administrator and fraud analyst permissions.
- **Database Connectivity:** Integrate MySQL and MongoDB.
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

The application follows a full-stack architecture:

1. **Presentation Layer:** Provides the dashboard, transaction views, fraud alerts, investigations, audit logs, and login interface.
2. **Application Layer:** Next.js API routes handle requests, validation, authentication, authorization, and business logic.
3. **Relational Data Layer:** MySQL stores structured records such as users, customers, transactions, alerts, investigations, notes, and audit logs.
4. **Document Data Layer:** MongoDB stores flexible risk-analysis results and related behavioral or investigation data.
5. **Security Layer:** NextAuth.js authentication and role checks protect application pages and API endpoints.

## 🗄️ Database Design

### MySQL

The relational database contains tables for:

- `users`
- `customers`
- `accounts`
- `transactions`
- `fraud_alerts`
- `investigation_cases`
- `case_notes`
- `audit_logs`
- `behavior_profiles`
- `student_phone` and other schema-specific tables, if present in the configured database

The application also uses the following monitoring views:

- `v_transaction_monitoring`
- `v_fraud_alert_dashboard`

### MongoDB

MongoDB supports document-oriented data storage for collections including:

- `risk_analysis`
- `behavior_events`
- `investigation_evidence`

The exact schema and available fields depend on the configured database and application implementation.

## 🔐 Security

The project incorporates the following security measures:

- Credential-based authentication.
- Password verification using bcrypt.
- Role-based authorization for administrative operations.
- Server-side protection for API endpoints.
- Input validation for supported operations.
- Audit logging for selected investigation and alert activities.
- Environment variables for database and authentication configuration.

**Security note:** Never commit `.env.local`, database passwords, authentication secrets, session tokens, or other sensitive credentials to version control.

## ⚙️ Prerequisites

Install the following before running the project:

- Node.js (a compatible version; the project was tested with Node.js 22).
- npm.
- MySQL Server.
- MongoDB Server or a configured MongoDB deployment.
- Git.

## 🚀 Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/Khushi-patel05/fraud-detection-system.git
cd fraud-detection-system
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a local `.env.local` file in the project root. Configure the database connection values and authentication settings required by the application.

Typical configuration keys may include:

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

Use the **exact variable names expected by the project's database and authentication configuration files**. Do not commit this file or use production credentials in a public repository.

### 4. Configure the databases

- Start MySQL and create/configure the required project database.
- Create or import the tables, relationships, and monitoring views expected by the application.
- Start MongoDB or configure the appropriate MongoDB URI.
- Ensure the application database account has only the permissions it needs.

Database schemas and sample data should be provided separately if required for reproducible setup.

### 5. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 6. Create a production build

```bash
npm run build
```

To run the production build locally:

```bash
npm start
```

## 🧪 Testing and Verification

The project can be verified through the following checks:

- Confirm that the application builds successfully.
- Verify login and logout behavior.
- Verify that unauthenticated requests to protected endpoints are rejected.
- Verify that analyst accounts cannot access administrator-only endpoints.
- Test transaction monitoring and risk-analysis responses.
- Test fraud alert status changes and investigation workflows.
- Verify that investigation notes and applicable audit entries are recorded.
- Test MySQL and MongoDB connectivity using authorized diagnostic endpoints.

Actual results depend on the configured databases and test data.

## 📁 Project Structure

```text
fraud-detection-system/
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
│   │   ├── login/
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── lib/
│   │   ├── api-auth.ts
│   │   ├── auth.ts
│   │   ├── db.ts
│   │   └── mongo.ts
│   ├── middleware.ts
│   └── types/
├── public/
├── .gitignore
├── package.json
├── package-lock.json
└── README.md
```

*This is a high-level representation of the application structure; additional files may exist in the repository.*

## ⚠️ Scope and Limitations

- Risk scoring is **rule-based**, not a trained machine-learning model.
- Detection quality depends on the rules, transaction data, and configured thresholds.
- The system is intended as an academic mini project and demonstration, not as a production-ready financial fraud prevention platform.
- Production deployment would require additional security hardening, operational monitoring, privacy controls, and extensive validation.

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

**Project Title:** Automated Fraud Detection & Behavioral Transaction Audit System  
**Project Name:** SentinelAI  
**Project Type:** DBMS Mini Project  
**Repository:** [Khushi-patel05/fraud-detection-system](https://github.com/Khushi-patel05/fraud-detection-system)