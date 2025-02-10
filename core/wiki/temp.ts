import { Environment } from '@third-party/vento/src/environment.ts'

type Constructor<T = {}> = new (...args: any[]) => T;

type UnionToIntersection<U> = 
  (U extends any ? (k: U) => void : never) extends (k: infer I) => void ? I : never;

function applyPlugins<BaseType extends Constructor, PluginFunctions extends Array<(base: Constructor) => Constructor>>(
  Base: BaseType,
  ...plugins: PluginFunctions
) {
  return plugins.reduce((base, plugin) => plugin(base), Base) as Constructor<
    Omit<InstanceType<BaseType>, 'extensions'> & {
      extensions: UnionToIntersection<
        | (InstanceType<BaseType> extends { extensions: any } 
            ? InstanceType<BaseType>['extensions'] 
            : {})
        | InstanceType<ReturnType<PluginFunctions[number]>>['extensions']
      >
    }
  >;
}

// Example usage:
class EmptyClass {}

// Define plugins
function TimestampPlugin<TBase extends Constructor>(Base: TBase) {
  return class Timestamp extends Base {
    extensions = {
      ...(super.extensions || {}),
      timestamp: Date.now()
    };
  };
}

function LoggablePlugin<TBase extends Constructor>(Base: TBase) {
  return class Loggable extends Base {
    extensions = {
      ...(super.extensions || {}),
      log: (message: string) => console.log(`[LOG]: ${message}`)
    };
  };
}

function SerializablePlugin<TBase extends Constructor>(Base: TBase) {
  return class Serializable extends Base {
    extensions = {
      ...(super.extensions || {}),
      serialize: () => JSON.stringify(this)
    };
  };
}

// Apply plugins to base class
const EnhancedClass = applyPlugins(
  EmptyClass,
  TimestampPlugin,
  LoggablePlugin,
  SerializablePlugin
);

// Create instance
const instance = new EnhancedClass();
instance.extensions.log("Hello World");    // Works
console.log(instance.extensions.timestamp); // Works
console.log(instance.extensions.serialize()); // Works

const env = new Environment({
  loader
})