/*
 * Copyright 2023 The Yorkie Authors. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { describe, it, assert } from 'vitest';
import { ElementRHT } from '@yorkie-js-sdk/src/document/crdt/element_rht';
import { CRDTObject } from '@yorkie-js-sdk/src/document/crdt/object';
import {
  InitialTimeTicket as ITT,
  TimeTicket,
} from '@yorkie-js-sdk/src/document/time/ticket';
import { CRDTRoot } from '@yorkie-js-sdk/src/document/crdt/root';
import { InitialChangeID } from '@yorkie-js-sdk/src/document/change/change_id';
import { ChangeContext } from '@yorkie-js-sdk/src/document/change/context';
import {
  CRDTTree,
  CRDTTreeNode,
  CRDTTreeNodeID,
  CRDTTreePos,
  toXML,
  TreeNodeForTest,
} from '@yorkie-js-sdk/src/document/crdt/tree';

/**
 * `idT` is a dummy CRDTTreeNodeID for testing.
 */
const idT = CRDTTreeNodeID.of(ITT, 0);

/**
 * `dummyContext` is a helper context that is used for testing.
 */
const dummyContext = ChangeContext.create(
  InitialChangeID,
  new CRDTRoot(new CRDTObject(ITT, ElementRHT.create())),
  {},
);

/**
 * `posT` is a helper function that issues a new CRDTTreeNodeID.
 */
function posT(offset = 0): CRDTTreeNodeID {
  return CRDTTreeNodeID.of(dummyContext.issueTimeTicket(), offset);
}

/**
 * `timeT` is a helper function that issues a new TimeTicket.
 */
function timeT(): TimeTicket {
  return dummyContext.issueTimeTicket();
}

describe('CRDTTreeNode', function () {
  it('Can be created', function () {
    const node = new CRDTTreeNode(idT, 'text', 'hello');
    assert.equal(node.id, idT);
    assert.equal(node.type, 'text');
    assert.equal(node.value, 'hello');
    assert.equal(node.size, 5);
    assert.equal(node.isText, true);
    assert.equal(node.isRemoved, false);
  });

  it('Can be split', function () {
    const para = new CRDTTreeNode(idT, 'p', []);
    para.append(new CRDTTreeNode(idT, 'text', 'helloyorkie'));
    assert.equal(toXML(para), /*html*/ `<p>helloyorkie</p>`);
    assert.equal(para.size, 11);
    assert.equal(para.isText, false);

    const left = para.children[0];
    const right = left.split(5, 0);
    assert.equal(toXML(para), /*html*/ `<p>helloyorkie</p>`);
    assert.equal(para.size, 11);

    assert.equal(left.value, 'hello');
    assert.equal(right!.value, 'yorkie');
    assert.deepEqual(left.id, CRDTTreeNodeID.of(ITT, 0));
    assert.deepEqual(right!.id, CRDTTreeNodeID.of(ITT, 5));
  });
});

// NOTE: To see the XML string as highlighted, install es6-string-html plugin in VSCode.
describe('CRDTTree.Edit', function () {
  it('Can inserts nodes with edit', function () {
    //       0
    // <root> </root>
    const t = new CRDTTree(new CRDTTreeNode(posT(), 'r'), timeT());
    assert.equal(t.getRoot().size, 0);
    assert.equal(t.toXML(), /*html*/ `<r></r>`);

    //           1
    // <root> <p> </p> </root>
    t.editT([0, 0], [new CRDTTreeNode(posT(), 'p')], timeT());
    assert.equal(t.toXML(), /*html*/ `<r><p></p></r>`);
    assert.equal(t.getRoot().size, 2);

    //           1
    // <root> <p> h e l l o </p> </root>
    t.editT([1, 1], [new CRDTTreeNode(posT(), 'text', 'hello')], timeT());
    assert.equal(t.toXML(), /*html*/ `<r><p>hello</p></r>`);
    assert.equal(t.getRoot().size, 7);

    //       0   1 2 3 4 5 6    7   8 9  10 11 12 13    14
    // <root> <p> h e l l o </p> <p> w  o  r  l  d  </p>  </root>
    const p = new CRDTTreeNode(posT(), 'p', []);
    p.insertAt(new CRDTTreeNode(posT(), 'text', 'world'), 0);
    t.editT([7, 7], [p], timeT());
    assert.equal(t.toXML(), /*html*/ `<r><p>hello</p><p>world</p></r>`);
    assert.equal(t.getRoot().size, 14);

    //       0   1 2 3 4 5 6 7    8   9 10 11 12 13 14    15
    // <root> <p> h e l l o ! </p> <p> w  o  r  l  d  </p>  </root>
    t.editT([6, 6], [new CRDTTreeNode(posT(), 'text', '!')], timeT());
    assert.equal(t.toXML(), /*html*/ `<r><p>hello!</p><p>world</p></r>`);

    assert.deepEqual(t.toTestTreeNode(), {
      type: 'r',
      children: [
        {
          type: 'p',
          children: [
            { type: 'text', value: 'hello', size: 5, isRemoved: false },
            { type: 'text', value: '!', size: 1, isRemoved: false },
          ],
          size: 6,
          isRemoved: false,
        } as TreeNodeForTest,
        {
          type: 'p',
          children: [
            { type: 'text', value: 'world', size: 5, isRemoved: false },
          ],
          size: 5,
          isRemoved: false,
        } as TreeNodeForTest,
      ],
      size: 15,
      isRemoved: false,
    });

    //       0   1 2 3 4 5 6 7 8    9   10 11 12 13 14 15    16
    // <root> <p> h e l l o ~ ! </p> <p>  w  o  r  l  d  </p>  </root>
    t.editT([6, 6], [new CRDTTreeNode(posT(), 'text', '~')], timeT());
    assert.equal(t.toXML(), /*html*/ `<r><p>hello~!</p><p>world</p></r>`);
  });

  it('Can delete text nodes with edit', function () {
    // 01. Create a tree with 2 paragraphs.
    //       0   1 2 3    4   5 6 7    8
    // <root> <p> a b </p> <p> c d </p> </root>
    const tree = new CRDTTree(new CRDTTreeNode(posT(), 'root'), timeT());
    tree.editT([0, 0], [new CRDTTreeNode(posT(), 'p')], timeT());
    tree.editT([1, 1], [new CRDTTreeNode(posT(), 'text', 'ab')], timeT());
    tree.editT([4, 4], [new CRDTTreeNode(posT(), 'p')], timeT());
    tree.editT([5, 5], [new CRDTTreeNode(posT(), 'text', 'cd')], timeT());
    assert.deepEqual(tree.toXML(), /*html*/ `<root><p>ab</p><p>cd</p></root>`);

    let treeNode = tree.toTestTreeNode();
    assert.equal(treeNode.size, 8);
    assert.equal(treeNode.children![0].size, 2);
    assert.equal(treeNode.children![0].children![0].size, 2);

    // 02. delete b from first paragraph
    //       0   1 2    3   4 5 6    7
    // <root> <p> a </p> <p> c d </p> </root>
    tree.editT([2, 3], undefined, timeT());
    assert.deepEqual(tree.toXML(), /*html*/ `<root><p>a</p><p>cd</p></root>`);

    treeNode = tree.toTestTreeNode();
    assert.equal(treeNode.size, 7);
    assert.equal(treeNode.children![0].size, 1);
    assert.equal(treeNode.children![0].children![0].size, 1);
  });

  it('Can find the closest TreePos when parentNode or leftSiblingNode does not exist', function () {
    const t = new CRDTTree(new CRDTTreeNode(posT(), 'root'), timeT());

    const pNode = new CRDTTreeNode(posT(), 'p');
    const textNode = new CRDTTreeNode(posT(), 'text', 'ab');

    //       0   1 2 3    4
    // <root> <p> a b </p> </root>
    t.editT([0, 0], [pNode], timeT());
    t.editT([1, 1], [textNode], timeT());
    assert.deepEqual(t.toXML(), /*html*/ `<root><p>ab</p></root>`);

    // Find the closest index.TreePos when leftSiblingNode in crdt.TreePos is removed.
    //       0   1    2
    // <root> <p> </p> </root>
    t.editT([1, 3], undefined, timeT());
    assert.deepEqual(t.toXML(), /*html*/ `<root><p></p></root>`);

    let [parent, left] = t.findNodesAndSplit(
      new CRDTTreePos(pNode.id, textNode.id),
      timeT(),
    );
    assert.equal(t.toIndex(parent, left), 1);

    // Find the closest index.TreePos when parentNode in crdt.TreePos is removed.
    //       0
    // <root> </root>
    t.editT([0, 2], undefined, timeT());
    assert.deepEqual(t.toXML(), /*html*/ `<root></root>`);

    [parent, left] = t.findNodesAndSplit(
      new CRDTTreePos(pNode.id, textNode.id),
      timeT(),
    );
    assert.equal(t.toIndex(parent, left), 0);
  });
});

describe('CRDTTree.Split', function () {
  it('Can split text nodes', function () {
    // 00. Create a tree with 2 paragraphs.
    //       0   1     6     11
    // <root> <p> hello world  </p> </root>
    const t = new CRDTTree(new CRDTTreeNode(posT(), 'root'), timeT());
    t.editT([0, 0], [new CRDTTreeNode(posT(), 'p')], timeT());
    t.editT([1, 1], [new CRDTTreeNode(posT(), 'text', 'helloworld')], timeT());
    const expectedIntial = {
      type: 'root',
      children: [
        {
          type: 'p',
          children: [
            { type: 'text', value: 'helloworld', size: 10, isRemoved: false },
          ],
          size: 10,
          isRemoved: false,
        } as TreeNodeForTest,
      ],
      size: 12,
      isRemoved: false,
    };
    assert.deepEqual(t.toTestTreeNode(), expectedIntial);

    // 01. Split left side of 'helloworld'.
    t.editT([1, 1], undefined, timeT());
    assert.deepEqual(t.toTestTreeNode(), expectedIntial);

    // 02. Split right side of 'helloworld'.
    t.editT([11, 11], undefined, timeT());
    assert.deepEqual(t.toTestTreeNode(), expectedIntial);

    // 03. Split 'helloworld' into 'hello' and 'world'.
    t.editT([6, 6], undefined, timeT());
    assert.deepEqual(t.toTestTreeNode(), {
      type: 'root',
      children: [
        {
          type: 'p',
          children: [
            { type: 'text', value: 'hello', size: 5, isRemoved: false },
            { type: 'text', value: 'world', size: 5, isRemoved: false },
          ],
          size: 10,
          isRemoved: false,
        } as TreeNodeForTest,
      ],
      size: 12,
      isRemoved: false,
    });
  });

  it.skip('Can split element nodes level 1', function () {
    //       0   1 2 3    4
    // <root> <p> a b </p> </root>

    // 01. Split position 1.
    let t = new CRDTTree(new CRDTTreeNode(posT(), 'root'), timeT());
    t.editT([0, 0], [new CRDTTreeNode(posT(), 'p')], timeT());
    t.editT([1, 1], [new CRDTTreeNode(posT(), 'text', 'ab')], timeT());
    assert.deepEqual(t.toXML(), /*html*/ `<root><p>ab</p></root>`);
    // t.editT([1, 1], undefined, [1, 1], timeT());
    assert.deepEqual(t.toXML(), /*html*/ `<root><p></p><p>ab</p></root>`);
    assert.equal(t.getSize(), 6);

    // 02. Split position 2.
    t = new CRDTTree(new CRDTTreeNode(posT(), 'root'), timeT());
    t.editT([0, 0], [new CRDTTreeNode(posT(), 'p')], timeT());
    t.editT([1, 1], [new CRDTTreeNode(posT(), 'text', 'ab')], timeT());
    assert.deepEqual(t.toXML(), /*html*/ `<root><p>ab</p></root>`);
    // t.editT([2, 2], undefined, [1, 1], timeT());
    assert.deepEqual(t.toXML(), /*html*/ `<root><p>a</p><p>b</p></root>`);
    assert.equal(t.getSize(), 6);

    // 03. Split position 3.
    t = new CRDTTree(new CRDTTreeNode(posT(), 'root'), timeT());
    t.editT([0, 0], [new CRDTTreeNode(posT(), 'p')], timeT());
    t.editT([1, 1], [new CRDTTreeNode(posT(), 'text', 'ab')], timeT());
    assert.deepEqual(t.toXML(), /*html*/ `<root><p>ab</p></root>`);
    // t.editT([3, 3], undefined, [1, 1], timeT());
    assert.deepEqual(t.toXML(), /*html*/ `<root><p>ab</p><p></p></root>`);
    assert.equal(t.getSize(), 6);
  });

  it.skip('Can split element nodes multi-level', function () {
    //       0   1   2 3 4    5    6
    // <root> <p> <b> a b </b> </p> </root>

    // 01. Split nodes level 1.
    let t = new CRDTTree(new CRDTTreeNode(posT(), 'root'), timeT());
    t.editT([0, 0], [new CRDTTreeNode(posT(), 'p')], timeT());
    t.editT([1, 1], [new CRDTTreeNode(posT(), 'b')], timeT());
    t.editT([2, 2], [new CRDTTreeNode(posT(), 'text', 'ab')], timeT());
    assert.deepEqual(t.toXML(), /*html*/ `<root><p><b>ab</b></p></root>`);
    // t.editT([3, 3], undefined, [1, 1], timeT());
    assert.deepEqual(
      t.toXML(),
      /*html*/ `<root><p><b>a</b><b>b</b></p></root>`,
    );

    // 02. Split nodes level 2.
    t = new CRDTTree(new CRDTTreeNode(posT(), 'root'), timeT());
    t.editT([0, 0], [new CRDTTreeNode(posT(), 'p')], timeT());
    t.editT([1, 1], [new CRDTTreeNode(posT(), 'b')], timeT());
    t.editT([2, 2], [new CRDTTreeNode(posT(), 'text', 'ab')], timeT());
    assert.deepEqual(t.toXML(), /*html*/ `<root><p><b>ab</b></p></root>`);
    // t.editT([3, 3], undefined, [2, 2], timeT());
    assert.deepEqual(
      t.toXML(),
      /*html*/ `<root><p><b>a</b></p><p><b>b</b></p></root>`,
    );

    // Split multiple nodes level 3. But, it is allowed to split only level 2.
    t = new CRDTTree(new CRDTTreeNode(posT(), 'root'), timeT());
    t.editT([0, 0], [new CRDTTreeNode(posT(), 'p')], timeT());
    t.editT([1, 1], [new CRDTTreeNode(posT(), 'b')], timeT());
    t.editT([2, 2], [new CRDTTreeNode(posT(), 'text', 'ab')], timeT());
    assert.deepEqual(t.toXML(), /*html*/ `<root><p><b>ab</b></p></root>`);
    // t.editT([3, 3], undefined, [3, 3], timeT());
    assert.deepEqual(
      t.toXML(),
      /*html*/ `<root><p><b>a</b></p><p><b>b</b></p></root>`,
    );
  });

  it.skip('Can split and merge element nodes by edit', function () {
    const t = new CRDTTree(new CRDTTreeNode(posT(), 'root'), timeT());
    t.editT([0, 0], [new CRDTTreeNode(posT(), 'p')], timeT());
    t.editT([1, 1], [new CRDTTreeNode(posT(), 'text', 'abcd')], timeT());
    assert.deepEqual(t.toXML(), /*html*/ `<root><p>abcd</p></root>`);
    assert.equal(t.getSize(), 6);

    //       0   1 2 3    4   5 6 7    8
    // <root> <p> a b </p> <p> c d </p> </root>
    // tree.split(3, 2);
    assert.deepEqual(t.toXML(), /*html*/ `<root><p>ab</p><p>cd</p></root>`);
    assert.equal(t.getSize(), 8);

    t.editT([3, 5], undefined, timeT());
    assert.deepEqual(t.toXML(), /*html*/ `<root><p>abcd</p></root>`);
    assert.equal(t.getSize(), 6);
  });
});

describe('CRDTTree.Merge', function () {
  it('Can delete nodes between element nodes with edit', function () {
    // 01. Create a tree with 2 paragraphs.
    //       0   1 2 3    4   5 6 7    8
    // <root> <p> a b </p> <p> c d </p> </root>
    const t = new CRDTTree(new CRDTTreeNode(posT(), 'root'), timeT());
    t.editT([0, 0], [new CRDTTreeNode(posT(), 'p')], timeT());
    t.editT([1, 1], [new CRDTTreeNode(posT(), 'text', 'ab')], timeT());
    t.editT([4, 4], [new CRDTTreeNode(posT(), 'p')], timeT());
    t.editT([5, 5], [new CRDTTreeNode(posT(), 'text', 'cd')], timeT());
    assert.deepEqual(t.toXML(), /*html*/ `<root><p>ab</p><p>cd</p></root>`);

    // 02. delete b, c and the second paragraph.
    //       0   1 2 3    4
    // <root> <p> a d </p> </root>
    t.editT([2, 6], undefined, timeT());
    assert.deepEqual(t.toXML(), /*html*/ `<root><p>ad</p></root>`);

    const node = t.toTestTreeNode();
    assert.equal(node.size, 4); // root
    assert.equal(node.children![0].size, 2); // p
    assert.equal(node.children![0].children![0].size, 1); // a
    assert.equal(node.children![0].children![1].size, 1); // d

    // 03. insert a new text node at the start of the first paragraph.
    t.editT([1, 1], [new CRDTTreeNode(posT(), 'text', '@')], timeT());
    assert.deepEqual(t.toXML(), /*html*/ `<root><p>@ad</p></root>`);
  });

  it('Can delete nodes between elements in different level with edit', function () {
    // 01. Create a tree with 2 paragraphs.
    //       0   1   2 3 4    5    6   7 8 9    10
    // <root> <p> <b> a b </b> </p> <p> c d </p>  </root>
    const t = new CRDTTree(new CRDTTreeNode(posT(), 'root'), timeT());
    t.editT([0, 0], [new CRDTTreeNode(posT(), 'p')], timeT());
    t.editT([1, 1], [new CRDTTreeNode(posT(), 'b')], timeT());
    t.editT([2, 2], [new CRDTTreeNode(posT(), 'text', 'ab')], timeT());
    t.editT([6, 6], [new CRDTTreeNode(posT(), 'p')], timeT());
    t.editT([7, 7], [new CRDTTreeNode(posT(), 'text', 'cd')], timeT());
    assert.deepEqual(
      t.toXML(),
      /*html*/ `<root><p><b>ab</b></p><p>cd</p></root>`,
    );

    // 02. delete b, c and second paragraph.
    //       0   1   2 3 4    5
    // <root> <p> <b> a d </b> </root>
    t.editT([3, 8], undefined, timeT());
    assert.deepEqual(t.toXML(), /*html*/ `<root><p><b>ad</b></p></root>`);
  });

  it.skip('Can merge different levels with edit', function () {
    // TODO(hackerwins): Fix this test.
    // 01. edit between two element nodes in the same hierarchy.
    //       0   1   2   3 4 5    6    7    8
    // <root> <p> <b> <i> a b </i> </b> </p> </root>
    let t = new CRDTTree(new CRDTTreeNode(posT(), 'root'), timeT());
    t.editT([0, 0], [new CRDTTreeNode(posT(), 'p')], timeT());
    t.editT([1, 1], [new CRDTTreeNode(posT(), 'b')], timeT());
    t.editT([2, 2], [new CRDTTreeNode(posT(), 'i')], timeT());
    t.editT([3, 3], [new CRDTTreeNode(posT(), 'text', 'ab')], timeT());
    assert.deepEqual(
      t.toXML(),
      /*html*/ `<root><p><b><i>ab</i></b></p></root>`,
    );
    t.editT([5, 6], undefined, timeT());
    assert.deepEqual(t.toXML(), /*html*/ `<root><p><b>ab</b></p></root>`);

    // 02. edit between two element nodes in same hierarchy.
    t = new CRDTTree(new CRDTTreeNode(posT(), 'root'), timeT());
    t.editT([0, 0], [new CRDTTreeNode(posT(), 'p')], timeT());
    t.editT([1, 1], [new CRDTTreeNode(posT(), 'b')], timeT());
    t.editT([2, 2], [new CRDTTreeNode(posT(), 'i')], timeT());
    t.editT([3, 3], [new CRDTTreeNode(posT(), 'text', 'ab')], timeT());
    assert.deepEqual(
      t.toXML(),
      /*html*/ `<root><p><b><i>ab</i></b></p></root>`,
    );
    t.editT([6, 7], undefined, timeT());
    assert.deepEqual(t.toXML(), /*html*/ `<root><p><i>ab</i></p></root>`);

    // 03. edit between text and element node in same hierarchy.
    t = new CRDTTree(new CRDTTreeNode(posT(), 'root'), timeT());
    t.editT([0, 0], [new CRDTTreeNode(posT(), 'p')], timeT());
    t.editT([1, 1], [new CRDTTreeNode(posT(), 'b')], timeT());
    t.editT([2, 2], [new CRDTTreeNode(posT(), 'i')], timeT());
    t.editT([3, 3], [new CRDTTreeNode(posT(), 'text', 'ab')], timeT());
    assert.deepEqual(
      t.toXML(),
      /*html*/ `<root><p><b><i>ab</i></b></p></root>`,
    );
    t.editT([4, 6], undefined, timeT());
    assert.deepEqual(t.toXML(), /*html*/ `<root><p><b>a</b></p></root>`);

    // 04. edit between text and element node in same hierarchy.
    t = new CRDTTree(new CRDTTreeNode(posT(), 'root'), timeT());
    t.editT([0, 0], [new CRDTTreeNode(posT(), 'p')], timeT());
    t.editT([1, 1], [new CRDTTreeNode(posT(), 'b')], timeT());
    t.editT([2, 2], [new CRDTTreeNode(posT(), 'i')], timeT());
    t.editT([3, 3], [new CRDTTreeNode(posT(), 'text', 'ab')], timeT());
    assert.deepEqual(
      t.toXML(),
      /*html*/ `<root><p><b><i>ab</i></b></p></root>`,
    );
    t.editT([5, 7], undefined, timeT());
    assert.deepEqual(t.toXML(), /*html*/ `<root><p>ab</p></root>`);

    // 05. edit between text and element node in same hierarchy.
    t = new CRDTTree(new CRDTTreeNode(posT(), 'root'), timeT());
    t.editT([0, 0], [new CRDTTreeNode(posT(), 'p')], timeT());
    t.editT([1, 1], [new CRDTTreeNode(posT(), 'b')], timeT());
    t.editT([2, 2], [new CRDTTreeNode(posT(), 'i')], timeT());
    t.editT([3, 3], [new CRDTTreeNode(posT(), 'text', 'ab')], timeT());
    assert.deepEqual(
      t.toXML(),
      /*html*/ `<root><p><b><i>ab</i></b></p></root>`,
    );
    t.editT([4, 7], undefined, timeT());
    assert.deepEqual(t.toXML(), /*html*/ `<root><p>a</p></root>`);

    // 06. edit between text and element node in same hierarchy.
    t = new CRDTTree(new CRDTTreeNode(posT(), 'root'), timeT());
    t.editT([0, 0], [new CRDTTreeNode(posT(), 'p')], timeT());
    t.editT([1, 1], [new CRDTTreeNode(posT(), 'b')], timeT());
    t.editT([2, 2], [new CRDTTreeNode(posT(), 'i')], timeT());
    t.editT([3, 3], [new CRDTTreeNode(posT(), 'text', 'ab')], timeT());
    assert.deepEqual(
      t.toXML(),
      /*html*/ `<root><p><b><i>ab</i></b></p></root>`,
    );
    t.editT([3, 7], undefined, timeT());
    assert.deepEqual(t.toXML(), /*html*/ `<root><p></p></root>`);

    // 07. edit between text and element node in same hierarchy.
    t = new CRDTTree(new CRDTTreeNode(posT(), 'root'), timeT());
    t.editT([0, 0], [new CRDTTreeNode(posT(), 'p')], timeT());
    t.editT([1, 1], [new CRDTTreeNode(posT(), 'text', 'ab')], timeT());
    t.editT([4, 4], [new CRDTTreeNode(posT(), 'p')], timeT());
    t.editT([5, 5], [new CRDTTreeNode(posT(), 'b')], timeT());
    t.editT([6, 6], [new CRDTTreeNode(posT(), 'text', 'cd')], timeT());
    t.editT([10, 10], [new CRDTTreeNode(posT(), 'p')], timeT());
    t.editT([11, 11], [new CRDTTreeNode(posT(), 'text', 'ef')], timeT());
    assert.deepEqual(
      t.toXML(),
      /*html*/ `<root><p>ab</p><p><b>cd</b></p><p>ef</p></root>`,
    );
    t.editT([9, 10], undefined, timeT());
    assert.deepEqual(
      t.toXML(),
      /*html*/ `<root><p>ab</p><b>cd</b><p>ef</p></root>`,
    );
  });
});
