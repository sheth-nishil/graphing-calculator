import { useRef, useEffect, useState } from "react";

export default function GraphCanvas() {
	const canvasRef = useRef(null);
	const ctxRef = useRef(null);

	const sizeRef = useRef({ width: 0, height: 0 });

	const isPanningRef = useRef(false);
	const lastMouseRef = useRef({ x: 0, y: 0 });

	// for mobile
	const lastTouchRef = useRef(null);
	const lastPinchDistRef = useRef(null);



	const MIN_SCALE = 10;
	const MAX_SCALE = 500;

	const [expression, setExpression] = useState("x^2");
	const rpnRef = useRef(null);


	useEffect(() => {
		const canvas = canvasRef.current;
		const ctx = canvas.getContext("2d");
		ctxRef.current = ctx;
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

		// =======================
		// Mobile touch support
		// =======================

		const getPinchDistance = (t1, t2) => {
			const dx = t1.clientX - t2.clientX;
			const dy = t1.clientY - t2.clientY;
			return Math.hypot(dx, dy);
		};

		const onTouchStart = (e) => {
			if (e.touches.length === 1) {
				const t = e.touches[0];
				lastTouchRef.current = { x: t.clientX, y: t.clientY };
			}

			if (e.touches.length === 2) {
				lastPinchDistRef.current = getPinchDistance(
					e.touches[0],
					e.touches[1]
				);
			}
		};

		const onTouchMove = (e) => {
			e.preventDefault();
			const view = viewRef.current;

			// 🖐️ Single-finger pan
			if (e.touches.length === 1 && lastTouchRef.current) {
				const t = e.touches[0];
				const dx = t.clientX - lastTouchRef.current.x;
				const dy = t.clientY - lastTouchRef.current.y;

				view.origin.x -= dx / view.scale;
				view.origin.y += dy / view.scale;

				lastTouchRef.current = { x: t.clientX, y: t.clientY };
				draw(ctx);
			}

			// 🤏 Pinch zoom
			if (e.touches.length === 2) {
				const [t1, t2] = e.touches;
				const dist = getPinchDistance(t1, t2);

				if (!lastPinchDistRef.current) {
					lastPinchDistRef.current = dist;
					return;
				}

				const zoomFactor = dist / lastPinchDistRef.current;

				const centerX = (t1.clientX + t2.clientX) / 2;
				const centerY = (t1.clientY + t2.clientY) / 2;

				const before = screenToWorld(centerX, centerY, canvas, view);

				view.scale *= zoomFactor;
				view.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.scale));

				const after = screenToWorld(centerX, centerY, canvas, view);

				view.origin.x += before.x - after.x;
				view.origin.y += before.y - after.y;

				lastPinchDistRef.current = dist;
				draw(ctx);
			}
		};

		const onTouchEnd = () => {
			lastTouchRef.current = null;
			lastPinchDistRef.current = null;
		};




		window.addEventListener("resize", resize);
		canvas.addEventListener("mousedown", onMouseDown);
		window.addEventListener("mousemove", onMouseMove);
		window.addEventListener("mouseup", stopPan);
		canvas.addEventListener("mouseleave", stopPan);
		canvas.addEventListener("wheel", onWheel, { passive: false });

		// for mobile
		canvas.addEventListener("touchstart", onTouchStart, { passive: false });
		canvas.addEventListener("touchmove", onTouchMove, { passive: false });
		canvas.addEventListener("touchend", onTouchEnd);



		return () => {
			window.removeEventListener("resize", resize);
			canvas.removeEventListener("mousedown", onMouseDown);
			window.removeEventListener("mousemove", onMouseMove);
			window.removeEventListener("mouseup", stopPan);
			canvas.removeEventListener("mouseleave", stopPan);
			canvas.removeEventListener("wheel", onWheel);

			// for mobile
			canvas.removeEventListener("touchstart", onTouchStart);
			canvas.removeEventListener("touchmove", onTouchMove);
			canvas.removeEventListener("touchend", onTouchEnd);
		};

	}, []);

	useEffect(() => {
		try {
			const tokens = tokenize(expression);
			const withMul = insertImplicitMultiplication(tokens);
			const withUnary = handleUnaryMinus(withMul);
			const rpn = shuntingYard(withUnary);

			rpnRef.current = rpn;

			// 🔑 force redraw
			if (ctxRef.current) {
				draw(ctxRef.current);
			}
		} catch (e) {
			rpnRef.current = null;

			if (ctxRef.current) {
				draw(ctxRef.current);
			}
		}
	}, [expression]);



	const draw = (ctx) => {
		const canvas = ctx.canvas;
		const view = viewRef.current;

		ctx.clearRect(0, 0, canvas.width, canvas.height);

		drawVerticalGrid(ctx, canvas, view);
		drawHorizontalGrid(ctx, canvas, view);

		drawXAxis(ctx, canvas, view);
		drawYAxis(ctx, canvas, view);

		if (rpnRef.current) {
			drawFunction(ctx, canvas, view, rpnRef.current);
		}

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

	function drawFunction(ctx, canvas, view, rpn) {
		ctx.strokeStyle = "blue";
		ctx.lineWidth = 2;
		ctx.beginPath();

		let firstPoint = true;

		for (let px = 0; px < canvas.width; px++) {
			const x = screenToWorld(px, 0, canvas, view).x;
			let y;

			try {
				y = evaluateRPN(rpn, { x });
			} catch {
				firstPoint = true;
				continue;
			}

			if (!isFinite(y)) {
				firstPoint = true;
				continue;
			}

			const p = worldToScreen(x, y, canvas, view);

			if (firstPoint) {
				ctx.moveTo(p.x, p.y);
				firstPoint = false;
			} else {
				ctx.lineTo(p.x, p.y);
			}
		}

		ctx.stroke();
	}


	// Helper functions for tokeniser
	function isDigit(char) {
		return char >= "0" && char <= "9";
	}

	function isLetter(char) {
		return char >= "a" && char <= "z" || char >= "A" && char <= "Z";
	}

	function isOperator(char) {
		return "+-*/^".includes(char);
	}

	function isFunctionName(name) {
		return ["sin", "cos", "tan", "log", "sqrt"].includes(name);
	}


	function tokenize(input) {
		const tokens = [];
		let i = 0;

		while (i < input.length) {
			const char = input[i];

			// 1️⃣ Ignore whitespace
			if (char === " ") {
				i++;
				continue;
			}

			// 2️⃣ Numbers (including decimals)
			if (isDigit(char) || char === ".") {
				let numStr = "";

				while (i < input.length && (isDigit(input[i]) || input[i] === ".")) {
					numStr += input[i];
					i++;
				}

				tokens.push({
					type: "number",
					value: parseFloat(numStr),
				});

				continue;
			}

			// 3️⃣ Letters → variables or function names
			if (isLetter(char)) {
				let name = "";

				while (i < input.length && isLetter(input[i])) {
					name += input[i];
					i++;
				}

				if (isFunctionName(name)) {
					tokens.push({ type: "function", value: name });
				} else {
					tokens.push({ type: "variable", value: name });
				}

				continue;
			}

			// 4️⃣ Operators
			if (isOperator(char)) {
				tokens.push({ type: "operator", value: char });
				i++;
				continue;
			}

			// 5️⃣ Parentheses
			if (char === "(" || char === ")") {
				tokens.push({ type: "paren", value: char });
				i++;
				continue;
			}

			// 6️⃣ Unknown character
			throw new Error(`Unexpected character: '${char}'`);
		}

		return tokens;
	}

	function evaluateRPN(rpnTokens, variables = {}) {
		const stack = [];

		for (const token of rpnTokens) {
			// 1️⃣ Numbers
			if (token.type === "number") {
				stack.push(token.value);
				continue;
			}

			// 2️⃣ Variables (x, y, etc.)
			if (token.type === "variable") {
				if (!(token.value in variables)) {
					throw new Error(`Variable ${token.value} not provided`);
				}
				stack.push(variables[token.value]);
				continue;
			}

			// 3️⃣ Operators
			if (token.type === "operator") {
				const b = stack.pop();
				const a = stack.pop();

				stack.push(applyOperator(token.value, a, b));
				continue;
			}

			// 4️⃣ Functions
			if (token.type === "function") {
				const a = stack.pop();
				stack.push(applyFunction(token.value, a));
				continue;
			}
		}

		if (stack.length !== 1) {
			throw new Error("Invalid expression");
		}

		return stack[0];
	}

	function applyOperator(op, a, b) {
		switch (op) {
			case "+": return a + b;
			case "-": return a - b;
			case "*": return a * b;
			case "/": return a / b;
			case "^": return Math.pow(a, b);
			default:
				throw new Error(`Unknown operator ${op}`);
		}
	}

	function applyFunction(name, x) {
		switch (name) {
			case "sin": return Math.sin(x);
			case "cos": return Math.cos(x);
			case "tan": return Math.tan(x);
			case "log": return Math.log(x);
			case "sqrt": return Math.sqrt(x);
			case "neg": return -x; // unary minus
			default:
				throw new Error(`Unknown function ${name}`);
		}
	}


	const OPERATORS = {
		"+": { precedence: 1, associativity: "left" },
		"-": { precedence: 1, associativity: "left" },
		"*": { precedence: 2, associativity: "left" },
		"/": { precedence: 2, associativity: "left" },
		"^": { precedence: 3, associativity: "right" },
	};

	function shuntingYard(tokens) {
		const output = [];
		const operators = [];

		for (const token of tokens) {
			// 1️⃣ Numbers & variables → output immediately
			if (token.type === "number" || token.type === "variable") {
				output.push(token);
				continue;
			}

			// 2️⃣ Functions → go to operator stack
			if (token.type === "function") {
				operators.push(token);
				continue;
			}

			// 3️⃣ Operators
			if (token.type === "operator") {
				while (
					operators.length > 0 &&
					(
						operators[operators.length - 1].type === "function" ||
						(
							operators[operators.length - 1].type === "operator" &&
							(
								OPERATORS[operators[operators.length - 1].value].precedence >
								OPERATORS[token.value].precedence ||
								(
									OPERATORS[operators[operators.length - 1].value].precedence ===
									OPERATORS[token.value].precedence &&
									OPERATORS[token.value].associativity === "left"
								)
							)
						)
					)
				) {
					output.push(operators.pop());
				}

				operators.push(token);
				continue;
			}

			// 4️⃣ Left parenthesis
			if (token.type === "paren" && token.value === "(") {
				operators.push(token);
				continue;
			}

			// 5️⃣ Right parenthesis
			if (token.type === "paren" && token.value === ")") {
				while (
					operators.length > 0 &&
					operators[operators.length - 1].value !== "("
				) {
					output.push(operators.pop());
				}

				// Remove '('
				operators.pop();

				// If function is on top, pop it too
				if (
					operators.length > 0 &&
					operators[operators.length - 1].type === "function"
				) {
					output.push(operators.pop());
				}

				continue;
			}
		}

		// 6️⃣ Drain remaining operators
		while (operators.length > 0) {
			output.push(operators.pop());
		}

		return output;
	}

	function shouldInsertMultiply(a, b) {
		const aType = a.type;
		const bType = b.type;

		// number x, number (, number sin
		if (aType === "number" &&
			(bType === "variable" || bType === "function" || isLeftParen(b))) {
			return true;
		}

		// x number, x x, x (, x sin
		if (aType === "variable" &&
			(bType === "number" || bType === "variable" || bType === "function" || isLeftParen(b))) {
			return true;
		}

		// ) number, ) x, ) (, ) sin
		if (isRightParen(a) &&
			(bType === "number" || bType === "variable" || bType === "function" || isLeftParen(b))) {
			return true;
		}

		return false;
	}

	function isLeftParen(token) {
		return token.type === "paren" && token.value === "(";
	}

	function isRightParen(token) {
		return token.type === "paren" && token.value === ")";
	}

	function insertImplicitMultiplication(tokens) {
		const result = [];

		for (let i = 0; i < tokens.length; i++) {
			const current = tokens[i];
			const prev = result[result.length - 1];

			if (prev && shouldInsertMultiply(prev, current)) {
				result.push({ type: "operator", value: "*" });
			}

			result.push(current);
		}

		return result;
	}

	function handleUnaryMinus(tokens) {
		const result = [];

		for (let i = 0; i < tokens.length; i++) {
			const token = tokens[i];
			const prev = result[result.length - 1];

			if (
				token.type === "operator" &&
				token.value === "-" &&
				(
					!prev || // start of expression
					prev.type === "operator" ||
					(prev.type === "paren" && prev.value === "(")
				)
			) {
				// Replace '-' with unary negation
				result.push({ type: "function", value: "neg" });
				continue;
			}

			result.push(token);
		}

		return result;
	}


	return <>
		<canvas ref={canvasRef} className="block touch-none" />
		<input
			type="text"
			value={expression}
			onChange={(e) => setExpression(e.target.value)}
			className="absolute top-4 left-4 z-10 w-64 px-3 py-2 border rounded shadow bg-white"
			placeholder="Enter expression (e.g. x^2 + sin(x))"
		/>

	</>;
}
