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

import { RedisSessionStorage } from '@shopify/shopify-app-session-storage-redis';
import Redis from 'ioredis';

let redisClient;

function getRedisClient() {
    if (!redisClient) {
        redisClient = new Redis(process.env.REDIS_URL, {
            tls: {},
            maxRetriesPerRequest: 0,
            enableReadyCheck: false,
            lazyConnect: true,  // connect only on first request
        });
    }
    return redisClient;
}

const sessionStorage = new RedisSessionStorage(getRedisClient());



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
    sessionStorage,
});


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

    res.send('App successfully installed 🎉');
});

/* -------------------------------
   Helper: Get Authenticated Client
-------------------------------- */

async function getRestClient(shop) {
    const sessionId = shopify.session.getOfflineId(shop);

    // IMPORTANT: use the sessionStorage variable you created
    const session = await sessionStorage.loadSession(sessionId);

    if (!session) {
        throw new Error(`Shop ${shop} not authenticated`);
    }

    return new shopify.clients.Rest({ session });
}


app.get('/', (req, res) => {
    res.send('Backend Running!');
})

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

app.listen(3000, () => {
    console.log("Server running on port 3000");
});
