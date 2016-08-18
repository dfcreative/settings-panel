'use strict';

const EventEmitter = require('events').EventEmitter
const inherits = require('inherits')
const isNumeric = require('is-numeric')
const css = require('dom-css')
const format = require('param-case')
const precision = require('mumath/precision')

module.exports = Range
inherits(Range, EventEmitter)

function Range (opts) {
	if (!(this instanceof Range)) return new Range(opts);

	this.update(opts);
}

Range.prototype.update = function (opts) {
	var scaleValue, scaleValueInverse, logmin, logmax, logsign

	if (!!opts.step && !!opts.steps) {
		throw new Error('Cannot specify both step and steps. Got step = ' + opts.step + ', steps = ', opts.steps)
	}

	opts.container.innerHTML = '';

	if (!opts.container) opts.container = document.body;

	var input = opts.container.querySelector('.settings-panel-range');

	if (!input) {
		input = opts.container.appendChild(document.createElement('input'))
		input.type = 'range'
		input.className = 'settings-panel-range'
	}

	if (opts.disabled) input.disabled = true;

	if (opts.log) opts.scale = 'log';

	// Create scale functions for converting to/from the desired scale:
	if (opts.scale === 'log') {
		scaleValue = function (x) {
			return logsign * Math.exp(Math.log(logmin) + (Math.log(logmax) - Math.log(logmin)) * x / 100)
		}
		scaleValueInverse = function (y) {
			return (Math.log(y * logsign) - Math.log(logmin)) * 100 / (Math.log(logmax) - Math.log(logmin))
		}
	} else {
		scaleValue = scaleValueInverse = function (x) { return x }
	}

	// Get initial value:
	if (opts.scale === 'log') {
		// Get options or set defaults:
		opts.max = (isNumeric(opts.max)) ? opts.max : 100
		opts.min = (isNumeric(opts.min)) ? opts.min : 0.1

		// Check if all signs are valid:
		if (opts.min * opts.max <= 0) {
			throw new Error('Log range min/max must have the same sign and not equal zero. Got min = ' + opts.min + ', max = ' + opts.max)
		} else {
			// Pull these into separate variables so that opts can define the *slider* mapping
			logmin = opts.min
			logmax = opts.max
			logsign = opts.min > 0 ? 1 : -1

			// Got the sign so force these positive:
			logmin = Math.abs(logmin)
			logmax = Math.abs(logmax)

			// These are now simply 0-100 to which we map the log range:
			opts.min = 0
			opts.max = 100

			// Step is invalid for a log range:
			if (isNumeric(opts.step)) {
				throw new Error('Log may only use steps (integer number of steps), not a step value. Got step =' + opts.step)
			}
			// Default step is simply 1 in linear slider space:
			opts.step = 1
		}

		opts.value = scaleValueInverse(isNumeric(opts.value) ? opts.value : scaleValue((opts.min + opts.max) * 0.5))

		if (opts.value * scaleValueInverse(opts.max) <= 0) {
			throw new Error('Log range initial value must have the same sign as min/max and must not equal zero. Got initial value = ' + opts.value)
		}
	} else {
		// If linear, this is much simpler:
		opts.max = (isNumeric(opts.max)) ? opts.max : 100
		opts.min = (isNumeric(opts.min)) ? opts.min : 0
		opts.step = (isNumeric(opts.step)) ? opts.step : (opts.max - opts.min) / 100

		opts.value = isNumeric(opts.value) ? opts.value : (opts.min + opts.max) * 0.5
	}

	// If we got a number of steps, use that instead:
	if (isNumeric(opts.steps)) {
		opts.step = isNumeric(opts.steps) ? (opts.max - opts.min) / opts.steps : opts.step
	}

	// Quantize the initial value to the requested step:
	var initialStep = Math.round((opts.value - opts.min) / opts.step)
	opts.value = opts.min + opts.step * initialStep

	//preser container data for display
	opts.container.setAttribute('data-min', opts.min);
	opts.container.setAttribute('data-max', opts.max);

	if (opts.scale === 'log') {
		//FIXME: not every log is of precision 3
		var prec = opts.precision != null ? opts.precision : 3;
	}
	else {
		if (opts.step) {
			var prec = opts.precision != null ? opts.precision : precision(opts.step);
		}
		else if (opts.steps) {
			var prec = opts.precision != null ? opts.precision : precision( (opts.max - opts.min) / opts.steps );
		}
	}

	var value = require('./value')({
		id: opts.id,
		container: opts.container,
		className: 'settings-panel-range-value',
		value: scaleValue(opts.value).toFixed(prec),
		type: opts.scale === 'log' ? 'text' : 'number',
		min: scaleValue(opts.min),
		max: scaleValue(opts.max),
		disabled: opts.disabled,
		//FIXME: step here might vary
		step: opts.step,
		input: (v) => {
			let scaledValue = scaleValueInverse(v)
			input.value = scaledValue;
			value.title = input.value;
			// value.value = v
			this.emit('input', v);
			input.setAttribute('value', scaledValue.toFixed(0))
			opts.container.style.setProperty('--value', scaledValue + '%');
			opts.container.style.setProperty('--coef', scaledValue/100);
		}
	});

	// Set value on the input itself:
	input.min = opts.min
	input.max = opts.max
	input.step = opts.step
	input.value = opts.value
	let v = 100 * (opts.value - opts.min) / (opts.max - opts.min);
	input.setAttribute('value', v.toFixed(0))
	opts.container.style.setProperty('--value', v + '%');
	opts.container.style.setProperty('--coef', v/100);

	setTimeout(() => {
		this.emit('init', parseFloat(value.value))
	});

	input.oninput = (data) => {
		var scaledValue = scaleValue(parseFloat(data.target.value));
		value.value = scaledValue.toFixed(prec);
		let v = 100 * (data.target.value - opts.min) / (opts.max - opts.min);
		input.setAttribute('value', v.toFixed(0));
		opts.container.style.setProperty('--value', v + '%');
		opts.container.style.setProperty('--coef', v/100);
		value.title = scaledValue;
		this.emit('input', scaledValue);
	}

	return this;
}
