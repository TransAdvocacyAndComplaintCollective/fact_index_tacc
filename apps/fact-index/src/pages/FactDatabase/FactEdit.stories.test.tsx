import { describe, it, expect } from 'vitest';
import * as Stories from './FactEdit.stories';

describe('FactEdit Stories', () => {
  it('should export CreateMode story', () => {
    expect(Stories.CreateMode).toBeDefined();
    expect(Stories.CreateMode.render).toBeDefined();
  });

  it('should have CreateMode story with play function', () => {
    expect(Stories.CreateMode.play).toBeDefined();
  });

  it('should export EditMode story', () => {
    expect(Stories.EditMode).toBeDefined();
    expect(Stories.EditMode.render).toBeDefined();
  });

  it('should have EditMode story with play function', () => {
    expect(Stories.EditMode.play).toBeDefined();
  });

  it('should export CreateSaveCallbackTest story', () => {
    expect(Stories.CreateSaveCallbackTest).toBeDefined();
  });

  it('should export FormFieldsTest story', () => {
    expect(Stories.FormFieldsTest).toBeDefined();
  });

  it('should have all test stories defined', () => {
    const testStories = [
      'CreateMode',
      'EditMode',
      'CreateSaveCallbackTest',
      'CancelCallbackTest',
      'SaveCallbackTest',
      'FormFieldsTest',
      'FormValidationEmptyFactTest',
      'FormValidationInvalidUrlTest',
      'EditModeEditReasonRequiredTest',
      'CreateModeNoReasonRequiredTest',
      'EditModeDirtyStateTest',
      'EditModeNoChangesTest',
      'EditModePreFilledFormTest',
      'FormInteractionTest',
      'SaveSuccessNotificationTest',
    ];

    testStories.forEach(storyName => {
      expect((Stories as any)[storyName], `Story '${storyName}' should be exported`).toBeDefined();
    });
  });
});
