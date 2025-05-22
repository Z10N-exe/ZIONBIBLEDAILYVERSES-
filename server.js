const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cron = require('node-cron');
const webpush = require('web-push');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// VAPID keys for push notifications (replace with your keys)
webpush.setVapidDetails(
    'mailto:nwebeduzion@gmail.com',
    'BAQ6ccfZkk4gMqwyed6IBTOlhieia2DagzDSSfW86XJ3srwwxoeAZrEps4XEhseBb2eK4B57NJoKcS6dqyHmnLM', // Replace with your public VAPID key
    'xdWLTG4SDSlSLhFik-02NXF8BJpyW-PCv1a1OdRN1X0' // Replace with your private VAPID key
);

// Store notification subscriptions
let subscriptions = [];

// Parse BBE.txt
async function parseBBEText() {
    try {
        const text = await fs.readFile(path.join(__dirname, 'public', 'data', 'BBE.txt'), 'utf8');
        const lines = text.split('\n').filter(line => line.trim());
        const books = [];
        let currentBook = null;

        lines.forEach(line => {
            if (line.startsWith('### ')) {
                const bookName = line.replace('### ', '').trim();
                currentBook = { name: bookName, chapters: [] };
                books.push(currentBook);
                return;
            }

            const match = line.match(/^\[(\d+):(\d+)\]\s(.+)$/);
            if (match && currentBook) {
                const [, chapterNum, verseNum, verseText] = match;
                const chapter = parseInt(chapterNum);
                let chapterObj = currentBook.chapters.find(c => c.chapter === chapter);
                if (!chapterObj) {
                    chapterObj = { chapter, verses: [] };
                    currentBook.chapters.push(chapterObj);
                }
                chapterObj.verses.push({ verse: parseInt(verseNum), text: verseText.trim() });
            }
        });

        books.forEach(book => {
            book.chapters.sort((a, b) => a.chapter - b.chapter);
            book.chapters.forEach(chapter => {
                chapter.verses.sort((a, b) => a.verse - b.verse);
            });
        });

        return { translation: 'Bible in Basic English', books };
    } catch (error) {
        console.error('Error parsing BBE.txt:', error);
        throw error;
    }
}

// Load KJV JSON
async function loadKJV() {
    try {
        const data = await fs.readFile(path.join(__dirname, 'public', 'data', 'KJV.json'), 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error loading KJV.json:', error);
        throw error;
    }
}

// Cache data
let kjvData = null;
let bbeData = null;

(async () => {
    kjvData = await loadKJV();
    bbeData = await parseBBEText();
})();

// Get random verse
function getRandomVerse(version) {
    const data = version === 'Bible in Basic English (BBE)' ? bbeData : kjvData;
    if (!data || !data.books.length) {
        throw new Error('Bible data not loaded');
    }
    const book = data.books[Math.floor(Math.random() * data.books.length)];
    const chapter = book.chapters[Math.floor(Math.random() * book.chapters.length)];
    const verse = chapter.verses[Math.floor(Math.random() * chapter.verses.length)];
    return {
        reference: `${book.name} ${chapter.chapter}:${verse.verse}`,
        text: verse.text
    };
}

// Save notification preferences
app.post('/api/save-notification', async (req, res) => {
    try {
        const { time, method, version, email, phone } = req.body;
        subscriptions.push({ time, method, version, email, phone });
        res.status(200).send('Notification preferences saved');
    } catch (error) {
        console.error('Error saving notification:', error);
        res.status(500).send('Error saving notification');
    }
});

// Save push subscription
app.post('/api/save-subscription', async (req, res) => {
    try {
        const subscription = req.body;
        subscriptions.push({ ...subscription, method: 'Push Notification' });
        res.status(200).send('Subscription saved');
    } catch (error) {
        console.error('Error saving subscription:', error);
        res.status(500).send('Error saving subscription');
    }
});

// Schedule notifications
cron.schedule('* * * * *', async () => {
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    for (const sub of subscriptions) {
        if (sub.time === currentTime && sub.method === 'Push Notification') {
            try {
                const verse = getRandomVerse(sub.version);
                const payload = JSON.stringify({
                    title: `Daily Bread: ${verse.reference}`,
                    body: verse.text,
                    icon: '/icon.png'
                });
                await webpush.sendNotification(sub, payload);
            } catch (error) {
                console.error('Error sending push notification:', error);
            }
        }
    }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});