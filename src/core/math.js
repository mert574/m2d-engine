export const Vec2 = {
    distance(a, b) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        return Math.sqrt(dx * dx + dy * dy);
    },

    direction(from, to) {
        return {
            x: to.x - from.x,
            y: to.y - from.y
        };
    },

    normalize(vec) {
        const len = Math.sqrt(vec.x * vec.x + vec.y * vec.y);
        return len > 0 ? { x: vec.x / len, y: vec.y / len } : { x: 0, y: 0 };
    },

    scale(vec, scalar) {
        return {
            x: vec.x * scalar,
            y: vec.y * scalar
        };
    }
};

export const Angle = {
    // Returns angle in radians between -PI and PI
    between(from, to) {
        return Math.atan2(to.y - from.y, to.x - from.x);
    },

    // Returns true if angle is within the half circle defined by direction
    inHalfCircle(angle, direction) {
        if (direction > 0) {
            return Math.abs(angle) < Math.PI/2;
        } else {
            return Math.abs(angle) > Math.PI/2;
        }
    }
}; 