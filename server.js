const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cron = require('node-cron');
const webpush = require('web-push');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// VAPID keys (replace with your own)
webpush.setVapidDetails(
    'mailto:nwebeduzion@gmail.com',
    'BAQ6ccfZkk4gMqwyed6IBTOlhieia2DagzDSSfW86XJ3srwwxoeAZrEps4XEhseBb2eK4B57NJoKcS6dqyHmnLM',
    'xdWLTG4SDSlSLhFik-02NXF8BJpyW-PCv1a1OdRN1X0'
);

let subscriptions = [];

// Load Bible data
let kjvData = null;
let bbeData = null;

async function loadBibleData() {
    try {
        // Load KJV (JSON format)
        const kjv = await fs.readFile(path.join(__dirname, 'public', 'data', 'KJV.json'), 'utf8');
        kjvData = JSON.parse(kjv);

        // Load BBE (TXT format)
        const bbeText = await fs.readFile(path.join(__dirname, 'public', 'data', 'BBE.txt'), 'utf8');
        const lines = bbeText.split('\n').filter(line => line.trim());
        const books = [];
        let currentBook = null;

        lines.forEach(line => {
            if (line.startsWith('### ')) {
                currentBook = { name: line.replace('### ', '').trim(), chapters: [] };
                books.push(currentBook);
            } else {
                const match = line.match(/^\[(\d+):(\d+)\]\s(.+)$/);
                if (match && currentBook) {
                    const [, chapter, verse, text] = match;
                    let chapterObj = currentBook.chapters.find(c => c.chapter === parseInt(chapter));
                    if (!chapterObj) {
                        chapterObj = { chapter: parseInt(chapter), verses: [] };
                        currentBook.chapters.push(chapterObj);
                    }
                    chapterObj.verses.push({ verse: parseInt(verse), text: text.trim() });
                }
            }
        });

        bbeData = { translation: 'Bible in Basic English', books };
    } catch (err) {
        console.error('Error loading Bible data:', err);
    }
}

// Get a random verse
function getRandomVerse(version) {
    const data = version === 'Bible in Basic English (BBE)' ? bbeData : kjvData;
    if (!data || !data.books.length) throw new Error('Bible data not loaded');

    const book = data.books[Math.floor(Math.random() * data.books.length)];
    const chapter = book.chapters[Math.floor(Math.random() * book.chapters.length)];
    const verse = chapter.verses[Math.floor(Math.random() * chapter.verses.length)];

    return {
        reference: `${book.name} ${chapter.chapter}:${verse.verse}`,
        text: verse.text
    };
}

// Save push subscription
app.post('/api/save-subscription', (req, res) => {
    const subscription = req.body;
    subscriptions.push(subscription);
    res.status(200).json({ success: true });
});

// Schedule daily notifications at 8 AM
cron.schedule('0 8 * * *', async () => {  // Runs every day at 8:00 AM
    console.log('Sending daily spiritual nourishment...');

    for (const sub of subscriptions) {
        try {
            const verse = getRandomVerse('King James Version (KJV)'); // or 'BBE'
            const payload = JSON.stringify({
                title: "🌿 Today's Spiritual Nourishment 🌿",
                body: `${verse.reference}\n\n${verse.text}`,
                icon: '/icon.png',
                badge: '/badge.png'
            });

            await webpush.sendNotification(sub, payload);
        } catch (err) {
            console.error('Failed to send notification:', err);
        }
    }
});

// Initialize server
(async () => {
    await loadBibleData();
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
})();
