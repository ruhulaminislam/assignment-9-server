# SalonBook — Backend API

The backend API for SalonBook, a salon appointment booking platform. It provides RESTful APIs for managing services, users, appointments, and transactions using Express.js and MongoDB.

## 🌐 Project Links

- **Backend API:** https://assignment-nine-server-beta.vercel.app/
- **Server Repository:** https://github.com/ruhulaminislam/assignment-9-server
- **Client Repository:** https://github.com/ruhulaminislam/assignment-9-client

## ✨ Key Features

### 👤 User Management
- Retrieve registered users.
- Update user profile information.
- Update admin profile information.
- Block and unblock user accounts.
- Verify authentication tokens.
- Protect admin-only operations.

### 💇 Service Management
- Create new salon services.
- Retrieve active public services.
- Retrieve all services for administrators.
- Search services.
- Filter services by category.
- Sort services by price.
- Retrieve service details by ID.
- Update service information.
- Activate or deactivate services.
- Delete services.

### 📅 Appointment Management
- Create appointments for authenticated users.
- Prevent booking an already occupied pending or confirmed time slot.
- Retrieve all appointments for administrators.
- Retrieve appointments belonging to a customer.
- Update appointment status.
- Allow users to cancel eligible pending appointments.
- Maintain appointment payment status.

### 💳 Payment & Transaction Management
- Stripe Checkout session verification.
- Verify payment status with Stripe.
- Store successful transaction records in MongoDB.
- Save Stripe Payment Intent information.
- Update appointment payment status after successful payment.
- Handle Stripe webhook events.
- Verify webhook signatures.
- Prevent duplicate webhook transaction records.

## 🧰 Technology Stack

| Category | Technologies |
|---|---|
| Runtime | Node.js |
| Backend Framework | Express.js 5 |
| Language | JavaScript (ES Modules) |
| Database | MongoDB |
| Payment Gateway | Stripe |
| Middleware | CORS, Express JSON |
| Environment Variables | dotenv |
| Hosting | Vercel |

## 📡 API Endpoints

### User APIs

| Method | Endpoint | Description |
|---|---|---|
| GET | `/users` | Get all users |
| PATCH | `/users/block/:id` | Block or unblock a user |
| PATCH | `/users/update-admin/:id` | Update admin profile |
| PATCH | `/users/update-user/:id` | Update user profile |

### Service APIs

| Method | Endpoint | Description |
|---|---|---|
| POST | `/services` | Create a service |
| GET | `/services/public` | Get public active services |
| GET | `/services` | Get all services |
| GET | `/services/:id` | Get service details |
| PATCH | `/services/update/:id` | Update a service |
| PATCH | `/services/status/:id` | Update service status |
| DELETE | `/services/delete/:id` | Delete a service |

### Appointment APIs

| Method | Endpoint | Description |
|---|---|---|
| POST | `/appointments` | Create an appointment |
| GET | `/appointments` | Get all appointments |
| GET | `/appointments/customer/:id` | Get customer appointments |
| PATCH | `/appointments/status/:id` | Update appointment status |
| PATCH | `/appointments/cancel/:id` | Cancel an eligible appointment |

### Transaction & Payment APIs

| Method | Endpoint | Description |
|---|---|---|
| POST | `/transactions` | Verify Stripe Checkout session and save transaction |
| GET | `/transactions` | Retrieve transaction records |
| POST | `/webhook/stripe` | Handle Stripe webhook events |

## ⚙️ Installation & Setup

### Prerequisites
- Node.js
- npm
- Git
- MongoDB Atlas or a MongoDB database
- Stripe account

### 1. Clone the repository

```bash
git clone https://github.com/ruhulaminislam/assignment-9-server.git

cd assignment-9-server
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env` file in the project root.

```env
MONGODB_URI=your_mongodb_connection_string

STRIPE_SECRET_KEY=your_stripe_secret_key

STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret
```

Never commit your actual `.env` file or expose secret keys publicly.

### 4. Start the backend server

```bash
node index.js
```

The backend runs on:

```text
http://localhost:5000
```

## 🗄️ Database Structure

The application uses MongoDB with the database name:

```text
assignment-nine
```

Main collections:

- `services`
- `user`
- `session`
- `appointments`
- `transactions`

## 🔐 Authentication & Authorization

The backend verifies authentication tokens using the session records stored in MongoDB.

- `verifyToken` checks the authorization token and retrieves the authenticated user.
- `verifyAdmin` restricts selected operations to administrators.
- User-specific routes apply user-role verification.

## 💳 Stripe Webhook Configuration

Configure the Stripe webhook endpoint:

```text
https://assignment-nine-server-beta.vercel.app/webhook/stripe
```

The webhook handles completed Checkout sessions, verifies the Stripe signature, checks payment status, saves transaction information, and updates the related appointment.

For local testing, configure the webhook endpoint using your Stripe testing setup and use the corresponding webhook signing secret.

## 🚀 Deployment

The backend is deployed on Vercel.

**Production API URL:**

https://assignment-nine-server-beta.vercel.app/

Make sure all required environment variables are configured in the deployment platform.

## 👨‍💻 Author

**Md. Ruhul Amin**

- GitHub: https://github.com/ruhulaminislam
