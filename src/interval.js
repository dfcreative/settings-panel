const isNumeric = require('is-numeric')
const css = require('dom-css')
const isMobile = require('is-mobile')()
const format = require('param-case')
const clamp = require('mumath/clamp')

module.exports = Range


function Range (root, opts) {
  if (!(this instanceof Range)) return new Range(root, opts)
  var self = this
  var scaleValue, scaleValueInverse, logmin, logmax, logsign, panel, input, handle

  var id = 'control-panel-interval-value-' + format(opts.label) + '-' + uuid
  var container = require('./container')(root, opts.label, opts.help)
  require('./label')(container, opts.label, id)

  if (!!opts.step && !!opts.steps) {
    throw new Error('Cannot specify both step and steps. Got step = ' + opts.step + ', steps = ', opts.steps)
  }

  setTimeout(function () {
    panel = document.getElementById('control-panel-' + uuid)
  })

  input = container.appendChild(document.createElement('span'))
  input.id = 'control-panel-interval-' + uuid
  input.className = 'control-panel-interval'

  handle = document.createElement('span')
  handle.className = 'control-panel-interval-handle'
  input.appendChild(handle)

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

  if (!Array.isArray(opts.initial)) {
    opts.initial = []
  }

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

    opts.initial = [
      scaleValueInverse(isNumeric(opts.initial[0]) ? opts.initial[0] : scaleValue(opts.min + (opts.max - opts.min) * 0.25)),
      scaleValueInverse(isNumeric(opts.initial[1]) ? opts.initial[1] : scaleValue(opts.min + (opts.max - opts.min) * 0.75))
    ]

    if (scaleValue(opts.initial[0]) * scaleValue(opts.max) <= 0 || scaleValue(opts.initial[1]) * scaleValue(opts.max) <= 0) {
      throw new Error('Log range initial value must have the same sign as min/max and must not equal zero. Got initial value = [' + scaleValue(opts.initial[0]) + ', ' + scaleValue(opts.initial[1]) + ']')
    }
  } else {
    // If linear, this is much simpler:
    opts.max = (isNumeric(opts.max)) ? opts.max : 100
    opts.min = (isNumeric(opts.min)) ? opts.min : 0
    opts.step = (isNumeric(opts.step)) ? opts.step : (opts.max - opts.min) / 100

    opts.initial = [
      isNumeric(opts.initial[0]) ? opts.initial[0] : (opts.min + opts.max) * 0.25,
      isNumeric(opts.initial[1]) ? opts.initial[1] : (opts.min + opts.max) * 0.75
    ]
  }

  // If we got a number of steps, use that instead:
  if (isNumeric(opts.steps)) {
    opts.step = isNumeric(opts.steps) ? (opts.max - opts.min) / opts.steps : opts.step
  }

  // Quantize the initial value to the requested step:
  opts.initial[0] = opts.min + opts.step * Math.round((opts.initial[0] - opts.min) / opts.step)
  opts.initial[1] = opts.min + opts.step * Math.round((opts.initial[1] - opts.min) / opts.step)

  var value = opts.initial

  function setHandleCSS () {
    css(handle, {
      left: ((value[0] - opts.min) / (opts.max - opts.min) * 100) + '%',
      right: (100 - (value[1] - opts.min) / (opts.max - opts.min) * 100) + '%'
    })
  }

  // Initialize CSS:
  setHandleCSS()

  // Display the values:
  var lValue = require('./value')(container, {
    initial: scaleValue(opts.initial[0]),
    width: '13%',
    type: 'text',
    left: true,
    id: id,
    uuid: uuid
  })
  var rValue = require('./value')(container, {
    initial: scaleValue(opts.initial[1]),
    width: '13%',
    type: 'text',
    uuid: uuid
  })

  // An index to track what's being dragged:
  var activeIndex = -1

  function mouseX (ev) {
    // Get mouse/touch position in page coords relative to the container:
    return (ev.touches && ev.touches[0] || ev).pageX - input.getBoundingClientRect().left
  }

  function setActiveValue (fraction) {
    if (activeIndex === -1) {
      return
    }

    // Get the position in the range [0, 1]:
    var lofrac = (value[0] - opts.min) / (opts.max - opts.min)
    var hifrac = (value[1] - opts.min) / (opts.max - opts.min)

    // Clip against the other bound:
    if (activeIndex === 0) {
      fraction = Math.min(hifrac, fraction)
    } else {
      fraction = Math.max(lofrac, fraction)
    }

    // Compute and quantize the new value:
    var newValue = opts.min + Math.round((opts.max - opts.min) * fraction / opts.step) * opts.step

    // Update value, in linearized coords:
    value[activeIndex] = newValue

    // Update and send the event:
    setHandleCSS()
    input.oninput()
  }

  var mousemoveListener = function (ev) {
    if (ev.target === input || ev.target === handle) ev.preventDefault()

    var fraction = clamp(mouseX(ev) / input.offsetWidth, 0, 1)

    setActiveValue(fraction)
  }

  var mouseupListener = function (ev) {
    panel.classList.remove('control-panel-interval-dragging')

    document.removeEventListener(isMobile ? 'touchmove' : 'mousemove', mousemoveListener)
    document.removeEventListener(isMobile ? 'touchend' : 'mouseup', mouseupListener)

    activeIndex = -1
  }

  input.addEventListener(isMobile ? 'touchstart' : 'mousedown', function (ev) {
    // Tweak control to make dragging experience a little nicer:
    panel.classList.add('control-panel-interval-dragging')

    // Get mouse position fraction:
    var fraction = clamp(mouseX(ev) / input.offsetWidth, 0, 1)

    // Get the current fraction of position --> [0, 1]:
    var lofrac = (value[0] - opts.min) / (opts.max - opts.min)
    var hifrac = (value[1] - opts.min) / (opts.max - opts.min)

    // This is just for making decisions, so perturb it ever
    // so slightly just in case the bounds are numerically equal:
    lofrac -= Math.abs(opts.max - opts.min) * 1e-15
    hifrac += Math.abs(opts.max - opts.min) * 1e-15

    // Figure out which is closer:
    var lodiff = Math.abs(lofrac - fraction)
    var hidiff = Math.abs(hifrac - fraction)

    activeIndex = lodiff < hidiff ? 0 : 1

    // Attach this to *document* so that we can still drag if the mouse
    // passes outside the container:
    document.addEventListener(isMobile ? 'touchmove' : 'mousemove', mousemoveListener)
    document.addEventListener(isMobile ? 'touchend' : 'mouseup', mouseupListener)
  })

  setTimeout(function () {
    var scaledLValue = scaleValue(value[0])
    var scaledRValue = scaleValue(value[1])
    lValue.value = scaledLValue
    rValue.value = scaledRValue
    self.emit('initialized', [scaledLValue, scaledRValue])
  })

  input.oninput = function () {
    var scaledLValue = scaleValue(value[0])
    var scaledRValue = scaleValue(value[1])
    lValue.value = scaledLValue
    rValue.value = scaledRValue
    self.emit('input', [scaledLValue, scaledRValue])
  }
}