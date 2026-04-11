// ============================================
// EVENT QUEUE — Lightweight event sourcing with Kafka-compatible interface
// ============================================
const db = require('../utils/jsonDB');
const { v4: uuidv4 } = require('uuid');

const COLLECTION = 'events';

// Built-in topic names
const TOPICS = {
    ORDER_CREATED:          'order.created',
    ORDER_PAID:             'order.paid',
    SELLER_ONBOARDED:       'seller.onboarded',
    GST_INVOICE_GENERATED:  'gst.invoice.generated',
    FRAUD_DETECTED:         'fraud.detected',
};

// In-memory subscribers: { [topic]: [handler, ...] }
const _subscribers = {};

let _offset = 0; // global offset counter (resets on restart — sufficient for dev)

// ── Publish ───────────────────────────────────────────────────────────────────
function publish(topic, event) {
    const envelope = {
        eventId:   uuidv4(),
        topic,
        partition: 0,
        offset:    _offset++,
        key:       event.key || null,
        value:     event,
        timestamp: new Date().toISOString(),
    };

    // Persist to JSON store
    db.create(COLLECTION, envelope);

    // Notify in-memory subscribers
    const handlers = _subscribers[topic] || [];
    for (const handler of handlers) {
        try {
            handler(envelope);
        } catch (err) {
            console.error(`[EventQueue] Handler error on topic ${topic}:`, err.message);
        }
    }

    return envelope;
}

// ── Subscribe ─────────────────────────────────────────────────────────────────
function subscribe(topic, handler) {
    if (typeof handler !== 'function') {
        throw new TypeError('Handler must be a function');
    }
    if (!_subscribers[topic]) {
        _subscribers[topic] = [];
    }
    _subscribers[topic].push(handler);
    return () => {
        _subscribers[topic] = _subscribers[topic].filter(h => h !== handler);
    };
}

// ── Query ─────────────────────────────────────────────────────────────────────
function getEvents(topic, fromDate = null) {
    return db.find(COLLECTION, e => {
        if (e.topic !== topic) return false;
        if (fromDate) {
            return new Date(e.timestamp).getTime() >= new Date(fromDate).getTime();
        }
        return true;
    });
}

// ── Initialization ────────────────────────────────────────────────────────────
function initialize() {
    const existing = db.find(COLLECTION);
    _offset = existing.length;
    console.log(`✅ EventQueue initialized — ${_offset} events in store`);
}

// ── Kafka adapter stub ────────────────────────────────────────────────────────
const kafkaAdapter = {
    connected: false,
    producer:  null,
    consumer:  null,

    async connect(brokers, clientId) {
        console.log(`[KafkaAdapter] Would connect to ${brokers} as ${clientId}`);
        console.log('[KafkaAdapter] Real Kafka not configured — using JSON fallback');
        this.connected = false;
    },

    async produce(topic, key, value) {
        if (!this.connected) {
            return publish(topic, { key, ...value });
        }
        // Real Kafka: this.producer.send(...)
    },

    async consume(topic, groupId, handler) {
        if (!this.connected) {
            return subscribe(topic, handler);
        }
        // Real Kafka: this.consumer.subscribe(...)
    },
};

module.exports = {
    publish,
    subscribe,
    getEvents,
    initialize,
    kafkaAdapter,
    TOPICS,
};
