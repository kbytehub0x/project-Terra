require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');

const app = express();

const { GoogleGenAI } = require('@google/genai');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
        if (allowedMimeTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only JPEG, JPG, PNG, and PDF are allowed.'));
        }
    }
});

const Stripe = require('stripe');

// Initialize Gemini Client
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Initialize Stripe
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('.'));

app.post('/api/appeal', upload.single('evidence'), async (req, res) => {
    try {
        const { platform, reason } = req.body;
        const file = req.file;

        if (!platform || !reason) {
            return res.status(400).json({ error: 'Platform and reason are required.' });
        }

        let contents = [];
        const prompt = `You are an expert legal assistant. Draft a formal, legally-structured deactivation appeal letter for a gig worker.
Platform: ${platform}
Deactivation Reason/Worker's Statement: ${reason}
${file ? 'The user has provided an image/document as evidence.' : ''}
Please provide the full text of the appeal letter.`;

        contents.push(prompt);

        if (file) {
            let mimeType = file.mimetype;
            if (mimeType === 'image/jpg') {
                mimeType = 'image/jpeg';
            }
            contents.push({
                inlineData: {
                    data: file.buffer.toString('base64'),
                    mimeType: mimeType
                }
            });
        }

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: contents
        });

        const appealText = response.text;

        res.json({
            success: true,
            appeal: appealText
        });
    } catch (error) {
        console.error('Error generating appeal:', error);
        res.status(500).json({ error: 'An error occurred while generating the appeal.' });
    }
});

app.post('/api/checkout', async (req, res) => {
    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'usd',
                        product_data: {
                            name: 'GigRescue AI - Deactivation Appeal Unlock',
                            description: 'Unlock and download your generated appeal letter.',
                        },
                        unit_amount: 1900, // $19.00
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            success_url: `${req.protocol}://${req.get('host')}/success.html`,
            cancel_url: `${req.protocol}://${req.get('host')}/index.html`,
        });

        res.json({ id: session.id, url: session.url });
    } catch (error) {
        console.error('Error creating Stripe session:', error);
        res.status(500).json({ error: 'An error occurred while creating the checkout session.' });
    }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
