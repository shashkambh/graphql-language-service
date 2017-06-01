/**
 *  Copyright (c) Facebook, Inc.
 *  All rights reserved.
 *
 *  This source code is licensed under the license found in the
 *  LICENSE file in the root directory of this source tree.
 *
 *  @flow
 */

import {expect} from 'chai';
import {Position} from 'graphql-language-service-utils';
import {beforeEach, describe, it} from 'mocha';

import * as handlers from '../MessageProcessor';

describe('MessageProcessor', () => {
  const queryDir = `${__dirname}/__queries__`;

  const textDocumentTestString = `
  {
    hero(episode: NEWHOPE){
    }
  }
  `;

  const initialDocument = {
    textDocument: {
      text: textDocumentTestString,
      uri: `${queryDir}/test.graphql`,
      version: 0,
    },
  };

  async function setup() {
    const params = {rootPath: __dirname};
    const {capabilities} = await handlers.handleInitializeRequest(params);

    expect(capabilities.definitionProvider).to.equal(true);
    expect(capabilities.completionProvider.resolveProvider).to.equal(true);
    expect(capabilities.textDocumentSync).to.equal(1);

    const result = await handlers.handleDidOpenOrSaveNotification(
      initialDocument,
    );
    expect(result.uri).to.equal(initialDocument.textDocument.uri);

    // Invalid query, diagnostics will show an error
    expect(result.diagnostics.length).not.to.equal(0);
  }

  describe('setup', () => {
    it('initializes properly', setup);
  });

  describe('fileLifecycle', () => {
    beforeEach(setup);

    it('runs completion requests', async () => {
      const empty = {
        textDocument: {text: '', uri: `${queryDir}/test2.graphql`, version: 0},
      };
      const out = await handlers.handleDidOpenOrSaveNotification(empty);
      expect(out.uri).to.equal(empty.textDocument.uri);

      const test = {
        position: new Position(0, 0),
        textDocument: empty.textDocument,
      };

      const expected = ['query', 'mutation', 'subscription', 'fragment', '{'];
      const result = await handlers.handleCompletionRequest(test);
      expect(result.items.length).to.equal(5);

      for (const index in result.items) {
        expect(expected).to.include(result.items[index].label);
      }
    });

    it('runs definition requests', async () => {
      const validQuery = `
      {
        hero(episode: EMPIRE){
          ...testFragment
        }
      }
      `;

      const newDocument = {
        textDocument: {
          text: validQuery,
          uri: `${queryDir}/test3.graphql`,
          version: 0,
        },
      };

      await handlers.handleDidOpenOrSaveNotification(newDocument);

      const test = {
        position: new Position(3, 15),
        textDocument: newDocument.textDocument,
      };

      const result = await handlers.handleDefinitionRequest(test);
      expect(result[0].uri).to.equal(`file://${queryDir}/testFragment.graphql`);
    });

    it('updates cache when the file is changed', async () => {
      const textDocumentChangedString = `
      {
        hero(episode: NEWHOPE){
          name
        }
      }
      `;

      const params = {
        textDocument: {
          text: textDocumentTestString,
          uri: `${queryDir}test.graphql`,
          version: 1,
        },
        contentChanges: [
          {text: textDocumentTestString},
          {text: textDocumentChangedString},
        ],
      };
      const result = await handlers.handleDidChangeNotification(params);
      expect(result.uri).to.equal(params.textDocument.uri);

      // Query fixed, no more errors
      expect(result.diagnostics.length).to.equal(0);
    });

    it('removes from cache when the file is closed', async () => {
      await handlers.handleDidCloseNotification(initialDocument);

      const position = {line: 4, character: 5};
      const params = {textDocument: initialDocument.textDocument, position};

      // Should throw because file has been deleted from cache
      return handlers
        .handleCompletionRequest(params)
        .then(result => expect(result).to.equal(null))
        .catch(() => {});
    });
  });
});
