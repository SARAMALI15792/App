import {fireEvent, render, screen} from '@testing-library/react-native';

import ComposeProviders from '@components/ComposeProviders';
import {CurrentUserPersonalDetailsProvider} from '@components/CurrentUserPersonalDetailsProvider';
import {LocaleContextProvider} from '@components/LocaleContextProvider';
import OnyxListItemProvider from '@components/OnyxListItemProvider';

import Navigation from '@libs/Navigation/Navigation';

import ReportActionItemThread from '@pages/inbox/report/ReportActionItemThread';

import CONST from '@src/CONST';
import ONYXKEYS from '@src/ONYXKEYS';
import ROUTES from '@src/ROUTES';
import type {Report, ReportAction} from '@src/types/onyx';

import React from 'react';
import Onyx from 'react-native-onyx';

import waitForBatchedUpdatesWithAct from '../utils/waitForBatchedUpdatesWithAct';

// The real navigateToAndOpenChildReport / createChildReport run; only routing side effects are stubbed.
jest.mock('@libs/Navigation/Navigation', () => ({
    navigate: jest.fn(),
    getActiveRoute: jest.fn(() => 'home'),
}));
jest.mock('@libs/Navigation/helpers/isSearchTopmostFullScreenRoute', () => () => false);

const mockNavigate = jest.mocked(Navigation.navigate);

const ME = 1;
const PARENT_REPORT_ID = 'concierge-report';
const parentReport: Report = {reportID: PARENT_REPORT_ID, type: CONST.REPORT.TYPE.CHAT};

function threadedAction(childReportID: string, childType?: string, counts = {visible: 2, commenters: 1}): ReportAction {
    return {
        reportActionID: `action-${childReportID}`,
        reportID: PARENT_REPORT_ID,
        actionName: CONST.REPORT.ACTIONS.TYPE.ADD_COMMENT,
        actorAccountID: ME,
        created: '2026-10-23 00:00:00.000',
        message: [{type: 'COMMENT', html: 'Need help', text: 'Need help'}],
        childReportID,
        childType,
        childVisibleActionCount: counts.visible,
        childCommenterCount: counts.commenters,
        childOldestFourAccountIDs: String(ME),
        childLastVisibleActionCreated: '2026-10-23 00:05:00.000',
    };
}

async function pressRow(action: ReportAction) {
    render(
        <ComposeProviders components={[OnyxListItemProvider, CurrentUserPersonalDetailsProvider, LocaleContextProvider]}>
            <ReportActionItemThread
                report={parentReport}
                reportAction={action}
                isHovered={false}
                isEditingInline={false}
                onSecondaryInteraction={() => undefined}
            />
        </ComposeProviders>,
    );
    await waitForBatchedUpdatesWithAct();
    fireEvent.press(screen.getByLabelText('2 Replies'));
    await waitForBatchedUpdatesWithAct();
}

function readReport(reportID: string): Promise<Report | undefined> {
    return new Promise((resolve) => {
        const connection = Onyx.connectWithoutView({
            key: `${ONYXKEYS.COLLECTION.REPORT}${reportID}`,
            callback: (value) => {
                Onyx.disconnect(connection);
                resolve(value);
            },
        });
    });
}

describe('ReportActionItemThread support ticket press', () => {
    beforeAll(() => {
        Onyx.init({keys: ONYXKEYS});
    });
    beforeEach(async () => {
        mockNavigate.mockClear();
        await Onyx.clear();
        await Onyx.merge(ONYXKEYS.SESSION, {accountID: ME});
        await waitForBatchedUpdatesWithAct();
    });

    it('opens an unloaded support ticket: opens ticket route and does not seed a chat', async () => {
        await pressRow(threadedAction('ticket-1', CONST.REPORT.TYPE.SUPPORT_TICKET));
        expect(mockNavigate).toHaveBeenCalledWith(ROUTES.REPORT_WITH_ID.getRoute('ticket-1', undefined, undefined, 'home'));
        expect((await readReport('ticket-1'))?.type).not.toBe(CONST.REPORT.TYPE.CHAT);
    });

    it('opens a loaded support ticket: opens ticket route and keeps type supportTicket', async () => {
        await Onyx.merge(`${ONYXKEYS.COLLECTION.REPORT}ticket-2`, {reportID: 'ticket-2', type: CONST.REPORT.TYPE.SUPPORT_TICKET});
        await waitForBatchedUpdatesWithAct();
        await pressRow(threadedAction('ticket-2', CONST.REPORT.TYPE.SUPPORT_TICKET));
        expect(mockNavigate).toHaveBeenCalledWith(ROUTES.REPORT_WITH_ID.getRoute('ticket-2', undefined, undefined, 'home'));
        expect((await readReport('ticket-2'))?.type).toBe(CONST.REPORT.TYPE.SUPPORT_TICKET);
    });

    it('regular thread, report not loaded: still seeds optimistic chat and navigates', async () => {
        await pressRow(threadedAction('chat-1', CONST.REPORT.TYPE.CHAT));
        expect(mockNavigate).toHaveBeenCalledWith(ROUTES.REPORT_WITH_ID.getRoute('chat-1', undefined, undefined, 'home'));
        expect((await readReport('chat-1'))?.type).toBe(CONST.REPORT.TYPE.CHAT);
    });

    it('thread with empty childType, report not loaded: still seeds optimistic chat', async () => {
        await pressRow(threadedAction('chat-2', undefined));
        expect(mockNavigate).toHaveBeenCalledWith(ROUTES.REPORT_WITH_ID.getRoute('chat-2', undefined, undefined, 'home'));
        expect((await readReport('chat-2'))?.type).toBe(CONST.REPORT.TYPE.CHAT);
    });

    it('task preview, report not loaded: does not seed a chat', async () => {
        await pressRow(threadedAction('task-1', CONST.REPORT.TYPE.TASK));
        expect((await readReport('task-1'))?.type).not.toBe(CONST.REPORT.TYPE.CHAT);
    });
});
