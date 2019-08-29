const WritableTrackingBuffer = require('./tracking-buffer/writable-tracking-buffer');
const writeAllHeaders = require('./all-headers').writeToTrackingBuffer;

// const OPTION = {
//   WITH_RECOMPILE: 0x01,
//   NO_METADATA: 0x02,
//   REUSE_METADATA: 0x04
// };

const STATUS = {
  BY_REF_VALUE: 0x01,
  DEFAULT_VALUE: 0x02
};

/*
  s2.2.6.5
 */
module.exports = class RpcRequestPayload {
  constructor(request, txnDescriptor, options) {
    this.request = request;
    this.procedure = this.request.sqlTextOrProcedure;
    this.options = options;
    this.txnDescriptor = txnDescriptor;
  }

  getData(cb) {
    const buffer = new WritableTrackingBuffer(500);
    if (this.options.tdsVersion >= '7_2') {
      const outstandingRequestCount = 1;
      writeAllHeaders(buffer, this.txnDescriptor, outstandingRequestCount);
    }

    if (typeof this.procedure === 'string') {
      buffer.writeUsVarchar(this.procedure);
    } else {
      buffer.writeUShort(0xFFFF);
      buffer.writeUShort(this.procedure);
    }

    const optionFlags = 0;
    buffer.writeUInt16LE(optionFlags);

    const parameters = this.request.parameters;
    const writeNext = (i) => {
      if (i >= parameters.length) {
        cb(buffer.data);
        return;
      }

      this._writeParameterData(parameters[i], buffer, () => {
        setImmediate(() => {
          writeNext(i + 1);
        });
      });
    };
    writeNext(0);
  }

  toString(indent) {
    indent || (indent = '');
    return indent + ('RPC Request - ' + this.procedure);
  }

  _writeParameterData(parameter, buffer, cb) {
    buffer.writeBVarchar('@' + parameter.name);

    let statusFlags = 0;
    if (parameter.output) {
      statusFlags |= STATUS.BY_REF_VALUE;
    }
    buffer.writeUInt8(statusFlags);

    const param = {
      value: parameter.value
    };

    const type = parameter.type;

    if ((type.id & 0x30) === 0x20) {
      if (parameter.length) {
        param.length = parameter.length;
      } else if (type.resolveLength) {
        param.length = type.resolveLength(parameter);
      }
    }

    if (type.hasPrecision) {
      if (parameter.precision) {
        param.precision = parameter.precision;
      } else if (type.resolvePrecision) {
        param.precision = type.resolvePrecision(parameter);
      }
    }

    if (type.hasScale) {
      if (parameter.scale) {
        param.scale = parameter.scale;
      } else if (type.resolveScale) {
        param.scale = type.resolveScale(parameter);
      }
    }

    type.writeTypeInfo(buffer, param, this.options);
    type.writeParameterData(buffer, param, this.options, () => {
      cb();
    });
  }
};