// import 'dotenv/config';
// import express from 'express';
// import crypto from 'crypto';
// import Shopify from 'shopify-api-node';
// import jwt from 'jsonwebtoken';

// // Shopify API (v12+ is ESM only)
// import { shopifyApi, ApiVersion, LATEST_API_VERSION } from '@shopify/shopify-api';
// import '@shopify/shopify-api/adapters/node'; // registers the Node adapter


// const app = express();
// app.use(express.json());  // Parse JSON bodies for webhooks
// var order = null;


// // Endpoint to generate Fygaro payment link and redirect
// app.get('/pay', async (req, res) => {
//     const {
//         customer_id,
//         email,
//         variant_id,
//         quantity,
//         line_items,

//         // Shipping
//         first_name,
//         last_name,
//         address1,
//         city,
//         zip,
//         country,
//         phone,

//         // Billing
//         billing_first_name,
//         billing_last_name,
//         billing_address1,
//         billing_city,
//         billing_zip,
//         billing_country,
//         billing_phone,

//         // Optional
//         order_comment
//     } = req.query;
//     const shopify = new Shopify({
//         shopName: process.env.SHOPIFY_STORE_URL,
//         accessToken: process.env.SHOPIFY_API_TOKEN
//     });

//     try {
//         let orderPayload = {}; // Build payload dynamically

//         if (line_items) {
//             console.log('Creating order with multiple line items');
//             const parsedLineItems = JSON.parse(decodeURIComponent(line_items || '[]'));
//             if (!Array.isArray(parsedLineItems) || parsedLineItems.length === 0) {
//                 throw new Error('Invalid line items');
//             }
//             orderPayload.line_items = parsedLineItems;
//         } else {
//             console.log('Creating order with single line item');
//             orderPayload.line_items = [{
//                 variant_id: parseInt(variant_id),
//                 quantity: parseInt(quantity),
//             }];
//         }

//         orderPayload.shipping_address = {
//             first_name, last_name, address1, city, zip, country, phone
//         };

//         orderPayload.email = email;
//         // Billing address
//         orderPayload.billing_address = {
//             first_name: billing_first_name,
//             last_name: billing_last_name,
//             address1: billing_address1,
//             city: billing_city,
//             zip: billing_zip,
//             country: billing_country,
//             phone: billing_phone
//         };

//         // Order note
//         if (order_comment) {
//             orderPayload.note = order_comment;
//         }

//         // Add customer association if ID provided
//         const parsedCustomerId = parseInt(customer_id);
//         if (!isNaN(parsedCustomerId)) {
//             orderPayload.customer = { id: parsedCustomerId };
//         }

//         orderPayload.financial_status = 'pending';

//         const order = await shopify.order.create(orderPayload);

//         let amount = order.total_price; // Or calculate manually
//         if (parseFloat(amount) < 200) {
//             amount = (parseFloat(amount) + 15).toString();
//         }
//         const currency = order.currency; // e.g., 'USD'
//         const customReference = order.name; // Use order name for tracking

//         // Generate JWT (header, payload, signature)
//         const header = {
//             alg: 'HS256',
//             typ: 'JWT',
//             kid: process.env.FYGARO_API_KEY,
//         };

//         const payload = {
//             amount, // Required: string with up to 2 decimals
//             currency, // Optional: defaults to button's currency
//             custom_reference: customReference, // Optional: for webhook tracking
//         };

//         const token = jwt.sign(payload, process.env.FYGARO_SECRET, { header });

//         // Build and redirect to Fygaro URL
//         const paymentUrl = `${process.env.FYGARO_BUTTON_URL}?jwt=${token}`;

//         // Redirect to Fygaro
//         res.redirect(paymentUrl);
//     } catch (error) {
//         console.error('Error creating order:', error);
//     }
// });

// // Endpoint to handle return from Fygaro and redirect to Shopify thank-you page
// app.get('/confirm', async (req, res) => {
//     const orderId = req.query.customReference; // Order ID from Fygaro
//     console.log('Fetching status URL for order ID:', orderId);

//     try {
//         const shopify = shopifyApi({
//             apiKey: process.env.SHOPIFY_API_TOKEN,
//             apiSecretKey: process.env.SHOPIFY_API_SECRET,
//             scopes: ['read_orders', 'write_orders'],
//             hostName: process.env.HOST.replace(/https?:\/\//, ''),
//             apiVersion: ApiVersion.October24, // Keep for 2024-10 compatibility
//         });

//         const session = {
//             shop: process.env.SHOPIFY_STORE_URL,
//             accessToken: process.env.SHOPIFY_API_TOKEN,
//         };

//         const client = new shopify.clients.Graphql({ session });

//         // Directly query the Order for statusPageUrl (2024-10 field name)
//         const orderQuery = `
//       query getOrderStatusUrl($id: ID!) {
//         order(id: $id) {
//           statusPageUrl  # Changed from orderStatusUrl
//         }
//       }
//     `;

//         const orderGid = `gid://shopify/Order/${orderId}`;
//         const orderResponse = await client.query({
//             data: {
//                 query: orderQuery,
//                 variables: { id: orderGid },
//             },
//         });

//         const orderData = orderResponse.body.data.order;
//         if (!orderData || !orderData.statusPageUrl) {
//             throw new Error('Order not found or status URL unavailable—verify ID and payment completion');
//         }

//         const statusPageUrl = orderData.statusPageUrl;
//         res.redirect(statusPageUrl); // Redirect to thank-you page
//     } catch (error) {
//         console.error('Error:', error);
//         res.redirect(`https://${process.env.SHOPIFY_STORE_URL}/account/orders`); // Fallback (login required)
//     }
// });

// // Webhook endpoint for Fygaro notifications (on successful payment)

// // import bodyParser from 'body-parser';
// // // Use body-parser to get raw body for signature verification
// // app.use(bodyParser.json({
// //     verify: (req, res, buf) => {
// //         req.rawBody = buf; // Store raw body for verification
// //     }
// // }));
// // Shopify configuration
// const shopify = new Shopify({
//     shopName: process.env.SHOPIFY_STORE_URL, // e.g., 'your-shop.myshopify.com'
//     accessToken: process.env.SHOPIFY_API_TOKEN,
//     apiVersion: '2024-10' // Use a recent API version
// });

// app.post('/webhook', async (req, res) => {
//     const secret = process.env.FYGARO_SECRET; // Your Fygaro API secret key
//     const signatureHeader = req.headers['fygaro-signature'];
//     const keyIdHeader = req.headers['fygaro-key-id'];

//     try {
//         // verifyWebhook({
//         //     rawBody: req.rawBody,
//         //     signatureHeader,
//         //     keyIdHeader,
//         //     secret, // Or support multiple secrets if rotating
//         //     tolerance: 300 // 5 minutes tolerance for timestamp
//         // });
//         console.log('Webhook signature verified');

//         // Webhook verified, process payload
//         const payload = req.body;

//         // Assume order_id is passed in customReference (set this when creating Fygaro payment link)
//         const orderId = payload.customReference;
//         if (!orderId) {
//             throw new Error('Missing order_id in customReference');
//         }

//         // Get the order details from Shopify to verify amount and currency
//         const order = await shopify.order.get(orderId);
//         if (order.financial_status !== 'pending') {
//             throw new Error('Order is not in pending status');
//         }

//         let expectedAmount = order.total_price; // Or remaining pending amount
//         if (parseFloat(expectedAmount) < 200) {
//             expectedAmount = (parseFloat(expectedAmount) + 15).toString();
//         }
//         const expectedCurrency = order.currency;

//         if (payload.amount !== expectedAmount || payload.currency !== expectedCurrency) {
//             throw new Error('Amount or currency mismatch');
//         }

//         // Create transaction to mark as paid
//         // For pending payments, create a 'sale' transaction
//         const transaction = await shopify.transaction.create(orderId, {
//             kind: 'sale',
//             status: 'success',
//             amount: payload.amount,
//             currency: payload.currency,
//             gateway: 'fygaro',
//             source: 'external',
//             test: false // Set to true for testing
//         });

//         res.status(200).send('Webhook processed successfully');
//     } catch (error) {
//         console.error('Webhook error:', error);
//         res.status(400).send('Invalid webhook');
//     }
// });

// app.listen(process.env.PORT, () => console.log(`Server running on port ${process.env.PORT}`));
// export default app;

import 'dotenv/config';
import express from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

import {
    shopifyApi,
    ApiVersion,
} from '@shopify/shopify-api';
import '@shopify/shopify-api/adapters/node';

const app = express();
app.use(express.json());

/* -------------------------------
   Shopify App Initialization
-------------------------------- */

const shopify = shopifyApi({
    apiKey: process.env.SHOPIFY_API_KEY,
    apiSecretKey: process.env.SHOPIFY_API_SECRET,
    scopes: process.env.SCOPES.split(','),
    hostName: process.env.HOST.replace(/^https?:\/\//, ''),
    apiVersion: ApiVersion.January26,
    isEmbeddedApp: false,
});

/* -------------------------------
   VERY SIMPLE TOKEN STORAGE
   ⚠ Replace with database in prod
-------------------------------- */

const SESSION_STORAGE = new Map();

async function storeSession(session) {
    SESSION_STORAGE.set(session.shop, session);
}

async function loadSession(shop) {
    return SESSION_STORAGE.get(shop);
}

/* -------------------------------
   OAuth Install Route
-------------------------------- */

app.get('/auth', async (req, res) => {
    const shop = req.query.shop;

    if (!shop) return res.status(400).send('Missing shop');

    await shopify.auth.begin({
        shop,
        callbackPath: '/auth/callback',
        isOnline: false,
        rawRequest: req,
        rawResponse: res,
    });
});

/* -------------------------------
   OAuth Callback
-------------------------------- */

app.get('/auth/callback', async (req, res) => {
    const callback = await shopify.auth.callback({
        rawRequest: req,
        rawResponse: res,
    });

    await storeSession(callback.session);

    res.send('App successfully installed 🎉');
});

/* -------------------------------
   Helper: Get Authenticated Client
-------------------------------- */

async function getRestClient(shop) {
    const session = await loadSession(shop);
    if (!session) throw new Error('Shop not authenticated');

    return new shopify.clients.Rest({ session });
}

/* -------------------------------
   PAYMENT ROUTE (/pay)
-------------------------------- */

app.get('/pay', async (req, res) => {
    try {
        console.log("step1");
        const { shop } = req.query;
        console.log('step2');
        const client = await getRestClient(shop);
        console.log('step3');

        const {
            email,
            variant_id,
            quantity,
            first_name,
            last_name,
            address1,
            city,
            zip,
            country,
            phone,
            billing_first_name,
            billing_last_name,
            billing_address1,
            billing_city,
            billing_zip,
            billing_country,
            billing_phone,
            order_comment,
        } = req.query;

        const orderPayload = {
            order: {
                line_items: [
                    {
                        variant_id: parseInt(variant_id),
                        quantity: parseInt(quantity),
                    },
                ],
                email,
                financial_status: 'pending',
                shipping_address: {
                    first_name,
                    last_name,
                    address1,
                    city,
                    zip,
                    country,
                    phone,
                },
                billing_address: {
                    first_name: billing_first_name,
                    last_name: billing_last_name,
                    address1: billing_address1,
                    city: billing_city,
                    zip: billing_zip,
                    country: billing_country,
                    phone: billing_phone,
                },
                note: order_comment,
            },
        };

        const response = await client.post({
            path: 'orders',
            data: orderPayload,
            type: 'application/json',
        });
        console.log('step4');

        const order = response.body.order;
        console.log('step5');

        let amount = order.total_price;
        if (parseFloat(amount) < 200) {
            amount = (parseFloat(amount) + 15).toString();
        }

        const token = jwt.sign(
            {
                amount,
                currency: order.currency,
                customReference: order.id,
            },
            process.env.FYGARO_SECRET,
            {
                header: {
                    alg: 'HS256',
                    typ: 'JWT',
                    kid: process.env.FYGARO_API_KEY,
                },
            }
        );
        console.log('step6');

        const paymentUrl = `${process.env.FYGARO_BUTTON_URL}?jwt=${token}`;

        res.redirect(paymentUrl);

    } catch (error) {
        console.error(error);
        res.status(500).send('Payment initialization failed');
    }
});

/* -------------------------------
   FYGARO RETURN → THANK YOU
-------------------------------- */

app.get('/confirm', async (req, res) => {
    try {
        const { shop, customReference } = req.query;
        const client = await getRestClient(shop);

        const orderGid = `gid://shopify/Order/${customReference}`;

        const response = await client.post({
            path: 'graphql',
            data: {
                query: `
          query getOrder($id: ID!) {
            order(id: $id) {
              statusPageUrl
            }
          }
        `,
                variables: { id: orderGid },
            },
        });

        const statusPageUrl =
            response.body.data.order.statusPageUrl;

        res.redirect(statusPageUrl);

    } catch (error) {
        console.error(error);
        res.redirect('/');
    }
});

/* -------------------------------
   FYGARO WEBHOOK
-------------------------------- */

app.post('/webhook', async (req, res) => {
    try {
        const payload = req.body;
        const { shop } = payload;
        const client = await getRestClient(shop);

        const orderId = payload.customReference;

        const orderResponse = await client.get({
            path: `orders/${orderId}`,
        });

        const order = orderResponse.body.order;

        if (order.financial_status !== 'pending') {
            return res.status(200).send('Already processed');
        }

        await client.post({
            path: `orders/${orderId}/transactions`,
            data: {
                transaction: {
                    kind: 'sale',
                    status: 'success',
                    amount: payload.amount,
                    currency: payload.currency,
                    gateway: 'fygaro',
                },
            },
            type: 'application/json',
        });

        res.status(200).send('Webhook processed');

    } catch (error) {
        console.error(error);
        res.status(400).send('Webhook failed');
    }
});

/* -------------------------------
   START SERVER
-------------------------------- */

app.listen(process.env.PORT, () =>
    console.log(`🚀 Server running on port ${process.env.PORT}`)
);
