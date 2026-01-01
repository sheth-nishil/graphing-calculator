import { useRef, useEffect } from "react";

export default function GraphCanvas() {
	const canvasRef = useRef(null);
	const sizeRef = useRef({ width: 0, height: 0 });

	const isPanningRef = useRef(false);
	const lastMouseRef = useRef({ x: 0, y: 0 });

	const MIN_SCALE = 10;
	const MAX_SCALE = 500;


	useEffect(() => {
		const canvas = canvasRef.current;
		const ctx = canvas.getContext("2d");
		ctx.imageSmoothingEnabled = false;
		ctx.lineCap = "butt";

		const resize = () => {
			const dpr = window.devicePixelRatio || 1;

			const width = window.innerWidth;
			const height = window.innerHeight;

			sizeRef.current = { width, height };

			canvas.style.width = `${width}px`;
			canvas.style.height = `${height}px`;

			canvas.width = width * dpr;
			canvas.height = height * dpr;

			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

			draw(ctx);
		};


		resize();


		const onMouseDown = (e) => {
			isPanningRef.current = true;
			lastMouseRef.current = { x: e.clientX, y: e.clientY };
		};

		const onMouseMove = (e) => {
			if (!isPanningRef.current) return;
			e.preventDefault();

			const dx = e.clientX - lastMouseRef.current.x;
			const dy = e.clientY - lastMouseRef.current.y;

			const view = viewRef.current;

			view.origin.x -= dx / view.scale;
			view.origin.y += dy / view.scale; // y is inverted

			lastMouseRef.current = { x: e.clientX, y: e.clientY };

			draw(ctx);
		};

		const stopPan = () => {
			isPanningRef.current = false;
		};

		const onWheel = (e) => {
			e.preventDefault();

			const canvas = canvasRef.current;
			const view = viewRef.current;

			const zoomFactor = 1.1;
			const direction = e.deltaY < 0 ? 1 : -1;
			const scaleChange = direction > 0 ? zoomFactor : 1 / zoomFactor;

			const mouseX = e.clientX;
			const mouseY = e.clientY;

			// 1️⃣ world point under cursor BEFORE zoom
			const worldBefore = screenToWorld(mouseX, mouseY, canvas, view);

			// 2️⃣ update scale
			const newScale = view.scale * scaleChange;
			if (newScale < MIN_SCALE || newScale > MAX_SCALE) return;

			view.scale = newScale;

			// 3️⃣ world point under cursor AFTER zoom
			const worldAfter = screenToWorld(mouseX, mouseY, canvas, view);

			// 4️⃣ shift origin so cursor stays fixed
			view.origin.x += worldBefore.x - worldAfter.x;
			view.origin.y += worldBefore.y - worldAfter.y;

			draw(ctx);
		};


		window.addEventListener("resize", resize);
		canvas.addEventListener("mousedown", onMouseDown);
		window.addEventListener("mousemove", onMouseMove);
		window.addEventListener("mouseup", stopPan);
		canvas.addEventListener("mouseleave", stopPan);
		canvas.addEventListener("wheel", onWheel, { passive: false });


		return () => {
			window.removeEventListener("resize", resize);
			canvas.removeEventListener("mousedown", onMouseDown);
			window.removeEventListener("mousemove", onMouseMove);
			window.removeEventListener("mouseup", stopPan);
			canvas.removeEventListener("mouseleave", stopPan);
			canvas.removeEventListener("wheel", onWheel);
		};

	}, []);

	const draw = (ctx) => {
		const canvas = ctx.canvas;
		const view = viewRef.current;

		ctx.clearRect(0, 0, canvas.width, canvas.height);

		drawVerticalGrid(ctx, canvas, view);
		drawHorizontalGrid(ctx, canvas, view);

		drawXAxis(ctx, canvas, view);
		drawYAxis(ctx, canvas, view);

		drawFunction(ctx, canvas, view);
		drawOrigin(ctx, canvas, view);
	};


	const viewRef = useRef({
		origin: { x: 0, y: 0 },
		scale: 50,
	});


	function worldToScreen(x, y, canvas, view) {
		return {
			x: canvas.width / 2 + (x - view.origin.x) * view.scale,
			y: canvas.height / 2 - (y - view.origin.y) * view.scale,
		};
	}

	function screenToWorld(px, py, canvas, view) {
		return {
			x: view.origin.x + (px - canvas.width / 2) / view.scale,
			y: view.origin.y - (py - canvas.height / 2) / view.scale,
		};
	}


	function snap(value) {
		return Math.round(value) + 0.5;
	}


	function drawOrigin(ctx, canvas, view) {
		const p = worldToScreen(0, 0, canvas, view);


		const x = snap(p.x);
		const y = snap(p.y);

		ctx.beginPath();
		ctx.fillStyle = "red";
		ctx.arc(x, y, 5, 0, Math.PI * 2);
		ctx.fill();

	}

	function drawXAxis(ctx, canvas, view) {
		const p1 = worldToScreen(-1000, 0, canvas, view);
		const p2 = worldToScreen(1000, 0, canvas, view);

		const y = snap(p1.y);

		ctx.strokeStyle = "#000";
		ctx.lineWidth = 2;

		ctx.beginPath();
		ctx.moveTo(p1.x, y);
		ctx.lineTo(p2.x, y);
		ctx.stroke();
	}


	function drawYAxis(ctx, canvas, view) {
		const p1 = worldToScreen(0, -1000, canvas, view);
		const p2 = worldToScreen(0, 1000, canvas, view);

		const x = snap(p1.x);

		ctx.strokeStyle = "#000";
		ctx.lineWidth = 2;

		ctx.beginPath();
		ctx.moveTo(x, p1.y);
		ctx.lineTo(x, p2.y);
		ctx.stroke();
	}


	function getWorldBounds(canvas, view) {
		const halfWidth = canvas.width / 2 / view.scale;
		const halfHeight = canvas.height / 2 / view.scale;

		return {
			left: view.origin.x - halfWidth,
			right: view.origin.x + halfWidth,
			bottom: view.origin.y - halfHeight,
			top: view.origin.y + halfHeight,
		};
	}

	function drawVerticalGrid(ctx, canvas, view) {
		const bounds = getWorldBounds(canvas, view);

		const startX = Math.floor(bounds.left);
		const endX = Math.ceil(bounds.right);

		for (let x = startX; x <= endX; x++) {
			if (x === 0) continue;

			ctx.strokeStyle = "#696969";
			ctx.lineWidth = 1;

			const p1 = worldToScreen(x, bounds.bottom, canvas, view);
			const p2 = worldToScreen(x, bounds.top, canvas, view);

			ctx.beginPath();
			ctx.moveTo(p1.x, p1.y);
			ctx.lineTo(p2.x, p2.y);
			ctx.stroke();
		}
	}

	function drawHorizontalGrid(ctx, canvas, view) {
		const bounds = getWorldBounds(canvas, view);

		const startY = Math.floor(bounds.bottom);
		const endY = Math.ceil(bounds.top);

		for (let y = startY; y <= endY; y++) {
			if (y === 0) continue;

			ctx.strokeStyle = "#696969";
			ctx.lineWidth = 1;

			const p1 = worldToScreen(bounds.left, y, canvas, view);
			const p2 = worldToScreen(bounds.right, y, canvas, view);

			ctx.beginPath();
			ctx.moveTo(p1.x, p1.y);
			ctx.lineTo(p2.x, p2.y);
			ctx.stroke();
		}
	}

	function f(x) {
		return 1/x; // change later
	}

	function drawFunction(ctx, canvas, view) {
		ctx.strokeStyle = "blue";
		ctx.lineWidth = 2;
		ctx.beginPath();

		let firstPoint = true;

		for (let px = 0; px <= canvas.width; px++) {
			// screen → world
			const worldX =
				view.origin.x + (px - canvas.width / 2) / view.scale;

			const worldY = f(worldX);

			// skip invalid values
			if (!Number.isFinite(worldY)) {
				firstPoint = true;
				continue;
			}

			// world → screen
			const screenX = px;
			const screenY =
				canvas.height / 2 - (worldY - view.origin.y) * view.scale;

			if (firstPoint) {
				ctx.moveTo(screenX, screenY);
				firstPoint = false;
			} else {
				ctx.lineTo(screenX, screenY);
			}
		}

		ctx.stroke();
	}


	return <canvas ref={canvasRef} className="block" />;
}
