define([
  "require",
  "app",
  "backbone",
  "core/entries/entries.nestedcollection",
  "core/entries/entries.collection"
],

function(require, app, Backbone, EntriesNestedCollection, EntriesCollection) {

  var nestedTypes = ['many_to_one', 'single_media'];

  var EntriesModel = Backbone.Model.extend({

    parse: function(result) {

      this._lastFetchedResult = result;

      result = this.parseRelational(result);
      result = this.parseDate(result);

      return result;
    },

    // The flatten option flattens many-one relationships so the id is returned
    // instead of the object
    get: function(attr, options) {
      var uiType, value;
      options = options || {};

      value = Backbone.Model.prototype.get.call(this, attr);

      if (options.flatten) {
        uiType = this.getStructure().get(attr).get('ui');
        if (nestedTypes.indexOf(uiType) > -1 && _.isObject(value) ) {
          value = value.get('id');
        }
      }

      return value;
    },

    // @todo: Why is this one called so many times?
    // @note: Use HTML5 form validation when possible
    validate: function(attributes, options) {
      var errors = [];
      var structure = this.getStructure();
      var isNothing = function(value) {
        return value === undefined || value === null || value === '' || (!app.isNumber(value) && !_.isDate(value) && _.isEmpty(value));
      };

      //only validates attributes that are part of the schema
      attributes = _.pick(attributes, structure.pluck('column_name'));

      _.each(attributes, function(value, key, list) {
        //Column
        var column = structure.get(key);

        // Don't validate hidden fields
        // @todo should this be adjusted since these fields are now posting in some cases?
        if (column.get('hidden_input')) {
          return;
        }

        // Don't validate ID
        if (key === 'id') {
          return;
        }

        var nullDisallowed = column.get('is_nullable') === 'NO';
        var isNull = isNothing(value);
        var input = ui.getModelColumnInput(this, key);

        var skipSerializationIfNull = input.hasOwnProperty('skipSerializationIfNull') && input.skipSerializationIfNull;

        var mess = (!skipSerializationIfNull && nullDisallowed && isNull)
          ? 'The field cannot be empty'
          : ui.validate(this, key, value);

        if (mess !== undefined) {
          errors.push({attr: key, message: mess});
        }
      }, this);

      if (errors.length > 0) return errors;
    },

    rollBack: function() {
      var data = this.parse(this._lastFetchedResult);
      return this.set(data);
    },

    parseDate: function(attributes) {
      if(!attributes) {
        return;
      }
      _.each(this.getStructure().getColumnsByType('datetime'), function(column) {
        if (attributes[column.id] !== null) {
          attributes[column.id] = new Date(attributes[column.id]);
        }
      });
      return attributes;
    },

    //@todo: this whole shebang should be cached in the collection
    parseRelational: function(attributes) {
      var structure = this.getStructure();
      var relationalColumns = structure.getRelationalColumns();

      EntriesCollection = EntriesCollection || require("core/entries/entries.collection");

      _.each(relationalColumns, function(column) {
        var id = column.id;
        var tableRelated = column.getRelated();
        var relationshipType = column.getRelationshipType();
        //var value = attributes[id];
        var hasData = attributes[id] !== undefined;
        var ui = structure.get(column).options;

        switch (relationshipType) {
          case 'MANYTOMANY':
          case 'ONETOMANY':
            var columns = ui.get('visible_columns') ? ui.get('visible_columns').split(',') : [];
            var value = attributes[id] || [];
            var options = {
              table: app.tables.get(tableRelated),
              structure: app.columns[tableRelated],
              parse:true,
              filters: {columns_visible: columns}
              //preferences: app.preferences[column.get('table_related')],
            };

            // make sure that the table exists
            // @todo move this to column schema?
            if (options.table === undefined) {
              throw "Directus Error! The related table '" + tableRelated + "' does not exist! Check your UI settings for the field '" + id + "' in the table '" + this.collection.table.id + "'";
            }

            // make sure that the visible columns exists
            // todo move this to ??
            var diff = _.difference(columns, options.structure.pluck('column_name'));
            if (diff.length > 0) {
              throw "Directus Error! The column(s) '" + diff.join(',') + "' does not exist in related table '" + options.table.id + "'. Check your UI settings";
            }

            if (relationshipType === 'ONETOMANY') {
              attributes[id] = new EntriesCollection(value, options);
              break;
            }

            if (relationshipType === 'MANYTOMANY') {
              options.junctionStructure = app.columns[column.get('junction_table')];
              attributes[id] = new EntriesNestedCollection(value, options);
            }

            break;

          case 'MANYTOONE':
            var data = {};

            if (attributes[id] !== undefined && attributes[id] !== null) {
              data = _.isObject(attributes[id]) ? attributes[id] : {id: attributes[id]};
            }

            attributes[id] = new EntriesModel(data, {collection: app.entries[tableRelated]});

            break;
        }

        attributes[id].parent = this;

      }, this);

      return attributes;
    },

    //@todo: This is maybe a hack. Can we make the patch better?
    diff: function(key, val, options) {
      var attrs, changedAttrs = {};
      if (typeof key === 'object') {
        attrs = key;
        options = val;
      } else {
        (attrs = {})[key] = val;
      }

      _.each(attrs, function(val, key) {
        if (this.get(key) != val) changedAttrs[key] = val;
      },this);

      //Always pass id
      changedAttrs.id = this.id;

      return changedAttrs;
    },

    sync: function(method, model, options) {

      /*
      var isModel,
          isCollection,
          attributes = this.attributes;

      if (method === 'patch' && options.includeRelationships) {

        var relationalColumns = this.getStructure().getRelationalColumns();
        //var relationalAttributes = _.pick(this.attributes, relationalKeys);

        _.each(relationalColumns, function(column) {
            var key = column.id;
            var value = attributes[key];

            // Some one-manys are not nested objects and will not need any special treatment
            if (!_.isObject(value)) return;

            // Check if it is a one-many and if it should be deleted!
            if ('MANYTOONE' === column.getRelationshipType() && _.isEmpty(value.attributes)) {
              options.attrs[key] = null;
              return;
            }

            // Add foreign data to patch. Only add changed attributes
            value = value.toJSON({changed: true});
            console.log(key, value);

            if (!_.isEmpty(value)) {
              options.attrs[key] = value;
            }

        }, this);

      }

      console.log('ATTRS', options.attrs);
      */

      return Backbone.sync.apply(this, [method, model, options]);
    },

    // returns true or false
    isMine: function() {
      var myId = parseInt(app.getCurrentUser().id,10),
          magicOwnerColumn = this.collection.table.get('magic_owner_column'),
          magicOwnerId = this.get(magicOwnerColumn);

      return myId === magicOwnerId;
    },

    // bigedit trumps write black list
    // bigedit = edit others
    // edit = edit your own
    canEdit: function(attribute) {
      var iAmTheOwner         = this.isMine(),
          privileges          = this.collection.privileges,
          bigeditPermission   = this.collection.hasPermission('bigedit'),
          editPermission      = this.collection.hasPermission('edit'),
          columnIsBlacklisted = !_.isEmpty(attribute) && this.collection.isWriteBlacklisted(attribute);

      return (!iAmTheOwner && bigeditPermission && !columnIsBlacklisted) || (iAmTheOwner && editPermission && !columnIsBlacklisted);
    },

    canDelete: function() {
      var iAmTheOwner = this.isMine(),
          canDelete = this.collection.hasPermission('delete'),
          canBigdelete = this.collection.hasPermission('bigdelete');

      return (!iAmTheOwner && canBigdelete) || (iAmTheOwner && canDelete);
    },

    toJSON: function(options, noNest) {
      var attributes = _.clone(this.attributes),
          isModel,
          isCollection;

      options = options || {};

      if (options.changed && !this.isNew()) {
        attributes = this.changed;
        // always include id
        if (!_.isEmpty(attributes) && this.id) {
          attributes.id = this.id;
        }
      }

      // expand relations
      _.each(this.attributes, function(value, key) {
        isModel = (value instanceof Backbone.Model);
        isCollection = (value instanceof Backbone.Collection);

        if (isModel || isCollection) {
          value = value.toJSON(options);
          if (_.isEmpty(value)) return;
          attributes[key] = value;
        }

      });

      // Pick selected columns, useful for collection "save"
      if (options && options.columns) {
        attributes = _.pick(attributes, options.columns);
      }

      return attributes;
    },

    getStructure: function() {
      return this.structure;
    },

    getTable: function() {
      return this.table;
    },

    initialize: function(data, options) {
      this.on('invalid', function(model, errors) {
        var details = _.map(errors, function(err) { return err.attr+':\n'+err.message; }).join('\n\n');
        details = 'table:\t' + this.getTable().id +
                  '\nrow id:\t' + this.id +
                  '\n-----------------------\n' + details;
        app.trigger('alert:error', 'The data is not valid', details);
      });
    },

    // we need to do this because initialize is called AFTER parse.
    constructor: function (data, options) {
      // inherit structure and table from collection if it exists
      this.structure = options.collection ? options.collection.structure : options.structure;
      this.table = options.collection ? options.collection.table : options.table;
      this.privileges = options.collection ? options.collection.privileges : options.privileges;

      EntriesModel.__super__.constructor.call(this, data, options);
    }

  });

  return EntriesModel;

});